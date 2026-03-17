import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { env } from "../../config/env.js";
import { createAnalysisProvider } from "../analysis/index.js";
import { createTranscriptionProvider } from "../transcription/index.js";
import { addMeetingFile, createImportedMeeting, getMeetingById, processMeeting } from "../../storage/meetingsStore.js";
import type { ImportedMeetingInput, MeetingProviderConnectionStatus, MeetingProviderOAuthToken } from "../../types/meetingProvider.js";
import type { MeetingProvider } from "../../types/meeting.js";
import {
  clearMeetingProviderToken,
  getMeetingProviderToken,
  saveMeetingProviderToken,
} from "../../storage/meetingProviderConnectionStore.js";

const TOKEN_REFRESH_WINDOW_MS = 60_000;
const MICROSOFT_GRAPH_BASE = "https://graph.microsoft.com/v1.0";
const MICROSOFT_LOGIN_BASE = "https://login.microsoftonline.com";
const ZOOM_OAUTH_BASE = "https://zoom.us/oauth";
const uploadsDir = path.resolve(process.cwd(), "uploads");

const providerConfig = {
  zoom: {
    clientId: () => env.zoomClientId,
    clientSecret: () => env.zoomClientSecret,
    redirectUri: () => env.zoomRedirectUri,
    webhookSecret: () => env.zoomWebhookSecret,
  },
  teams: {
    clientId: () => env.microsoftClientId,
    clientSecret: () => env.microsoftClientSecret,
    redirectUri: () => env.microsoftRedirectUri,
    webhookSecret: () => env.teamsWebhookSecret,
  },
} as const;

const meetingProviderLabels: Record<MeetingProvider, string> = {
  zoom: "Zoom",
  teams: "Microsoft Teams",
};

const ensureConfig = (provider: MeetingProvider) => {
  const config = providerConfig[provider];
  if (!config.clientId() || !config.clientSecret() || !config.redirectUri()) {
    throw new MeetingProviderIntegrationError(
      `${meetingProviderLabels[provider]} integration is not configured.`,
      503,
    );
  }
};

const createState = (provider: MeetingProvider, userId: string) =>
  Buffer.from(JSON.stringify({ provider, userId, nonce: crypto.randomUUID() })).toString("base64url");

const parseState = (provider: MeetingProvider, state?: string) => {
  if (!state) {
    throw new MeetingProviderIntegrationError("Missing OAuth state.", 400);
  }

  const decoded = JSON.parse(Buffer.from(state, "base64url").toString("utf8")) as {
    provider?: string;
    userId?: string;
  };
  if (decoded.provider !== provider || !decoded.userId) {
    throw new MeetingProviderIntegrationError("Invalid OAuth state.", 400);
  }

  return decoded.userId;
};

const isMimeTypeSupported = (mimeType: string) =>
  new Set([
    "audio/mpeg",
    "audio/mp3",
    "audio/wav",
    "audio/x-wav",
    "audio/mp4",
    "audio/m4a",
    "audio/webm",
    "video/mp4",
    "video/webm",
  ]).has(mimeType);

const sanitizeFileName = (value: string) => value.replace(/[^a-zA-Z0-9._-]/g, "_");

const saveRemoteFile = async (url: string, accessToken: string, preferredName: string) => {
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new MeetingProviderIntegrationError(`Failed to download provider recording: ${await response.text()}`, response.status);
  }

  const contentType = response.headers.get("content-type") ?? "application/octet-stream";
  if (!isMimeTypeSupported(contentType)) {
    throw new MeetingProviderIntegrationError(`Unsupported provider media format: ${contentType}`, 400);
  }

  const bytes = Buffer.from(await response.arrayBuffer());
  await fs.mkdir(uploadsDir, { recursive: true });
  const filePath = path.join(uploadsDir, `${Date.now()}_${sanitizeFileName(preferredName)}`);
  await fs.writeFile(filePath, bytes);

  return {
    path: filePath,
    mimeType: contentType,
    size: bytes.byteLength,
  };
};

const analyzeTranscript = async (meetingId: string, title: string, attendees: string[], transcriptText: string) => {
  const analysisProvider = createAnalysisProvider();
  const analysis = await analysisProvider.analyze({
    meetingTitle: title,
    attendees,
    transcript: transcriptText,
  });
  return processMeeting(meetingId, transcriptText, analysis);
};

type ProviderHandler = {
  getStatus(userId: string): Promise<MeetingProviderConnectionStatus>;
  getAuthorizationUrl(userId: string): string;
  handleCallback(code: string, state?: string): Promise<void>;
  disconnect(userId: string): Promise<{ ok: true }>;
  importMeeting(userId: string, payload: ImportedMeetingInput): Promise<unknown>;
  handleWebhook(body: unknown, headers: Record<string, string | string[] | undefined>): Promise<{ accepted: boolean }>;
};

export class MeetingProviderIntegrationError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "MeetingProviderIntegrationError";
    this.status = status;
  }
}

const zoomScopes = ["recording:read", "meeting:read", "user:read"];

const teamsScopes = [
  "offline_access",
  "openid",
  "profile",
  "email",
  "User.Read",
  "OnlineMeetings.Read",
];

const withTokenRefresh = async (
  provider: MeetingProvider,
  userId: string,
  refresher: (token: MeetingProviderOAuthToken) => Promise<MeetingProviderOAuthToken>,
) => {
  const current = await getMeetingProviderToken(provider, userId);
  if (!current) {
    throw new MeetingProviderIntegrationError(`${meetingProviderLabels[provider]} is not connected yet.`, 401);
  }

  if (new Date(current.expiresAt).getTime() - Date.now() > TOKEN_REFRESH_WINDOW_MS) {
    return current;
  }

  if (!current.refreshToken) {
    throw new MeetingProviderIntegrationError(`${meetingProviderLabels[provider]} token expired. Reconnect the integration.`, 401);
  }

  const refreshed = await refresher(current);
  await saveMeetingProviderToken(provider, userId, refreshed);
  return refreshed;
};

const zoomProvider: ProviderHandler = {
  async getStatus(userId) {
    return {
      provider: "zoom",
      configured: Boolean(env.zoomClientId && env.zoomClientSecret && env.zoomRedirectUri),
      connected: Boolean(await getMeetingProviderToken("zoom", userId)),
      externalEmail: (await getMeetingProviderToken("zoom", userId))?.externalEmail,
    };
  },

  getAuthorizationUrl(userId) {
    ensureConfig("zoom");
    const params = new URLSearchParams({
      response_type: "code",
      client_id: env.zoomClientId ?? "",
      redirect_uri: env.zoomRedirectUri ?? "",
      state: createState("zoom", userId),
    });
    if (zoomScopes.length > 0) {
      params.set("scope", zoomScopes.join(" "));
    }
    return `${ZOOM_OAUTH_BASE}/authorize?${params.toString()}`;
  },

  async handleCallback(code, state) {
    ensureConfig("zoom");
    const userId = parseState("zoom", state);
    const auth = Buffer.from(`${env.zoomClientId}:${env.zoomClientSecret}`).toString("base64");
    const response = await fetch(`${ZOOM_OAUTH_BASE}/token`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: env.zoomRedirectUri ?? "",
      }),
    });
    if (!response.ok) {
      throw new MeetingProviderIntegrationError(`Zoom token exchange failed: ${await response.text()}`, response.status);
    }

    const body = (await response.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in: number;
      scope?: string;
      uid?: string;
    };
    await saveMeetingProviderToken("zoom", userId, {
      accessToken: body.access_token,
      refreshToken: body.refresh_token,
      expiresAt: new Date(Date.now() + body.expires_in * 1000).toISOString(),
      scope: body.scope,
      externalUserId: body.uid,
    });
  },

  async disconnect(userId) {
    await clearMeetingProviderToken("zoom", userId);
    return { ok: true };
  },

  async importMeeting(userId, payload) {
    const token = await withTokenRefresh("zoom", userId, async (current) => {
      const auth = Buffer.from(`${env.zoomClientId}:${env.zoomClientSecret}`).toString("base64");
      const response = await fetch(`${ZOOM_OAUTH_BASE}/token`, {
        method: "POST",
        headers: {
          Authorization: `Basic ${auth}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: current.refreshToken ?? "",
        }),
      });
      if (!response.ok) {
        throw new MeetingProviderIntegrationError(`Zoom token refresh failed: ${await response.text()}`, response.status);
      }
      const body = (await response.json()) as {
        access_token: string;
        refresh_token?: string;
        expires_in: number;
        scope?: string;
      };
      return {
        accessToken: body.access_token,
        refreshToken: body.refresh_token ?? current.refreshToken,
        expiresAt: new Date(Date.now() + body.expires_in * 1000).toISOString(),
        scope: body.scope ?? current.scope,
        externalUserId: current.externalUserId,
        externalEmail: current.externalEmail,
        metadata: current.metadata,
      };
    });
    return importMeetingPayload(payload, token.accessToken);
  },

  async handleWebhook(body, headers) {
    const signature = Array.isArray(headers["x-zm-signature"]) ? headers["x-zm-signature"][0] : headers["x-zm-signature"];
    if (env.zoomWebhookSecret && !signature) {
      throw new MeetingProviderIntegrationError("Missing Zoom webhook signature.", 401);
    }

    const payload = body as {
      event?: string;
      payload?: {
        account_id?: string;
        object?: {
          id?: string | number;
          topic?: string;
          start_time?: string;
          host_email?: string;
          join_url?: string;
          participants?: Array<{ user_email?: string }>;
          recording_files?: Array<{
            id?: string;
            file_type?: string;
            recording_type?: string;
            download_url?: string;
            file_extension?: string;
          }>;
        };
      };
    };

    if (payload.event !== "recording.completed") {
      return { accepted: true };
    }

    const object = payload.payload?.object;
    const recording = object?.recording_files?.find((entry) => entry.download_url);
    if (!object?.id || !recording?.download_url) {
      return { accepted: true };
    }

    const connection = await prismaMeetingProviderConnectionByExternal("zoom", payload.payload?.account_id);
    if (!connection) return { accepted: true };

    await zoomProvider.importMeeting(connection.userId, {
      provider: "zoom",
      title: object.topic ?? "Zoom Meeting",
      scheduledAt: object.start_time,
      attendees: (object.participants ?? []).map((item) => item.user_email).filter((value): value is string => Boolean(value)),
      organizerEmail: object.host_email,
      externalMeetingId: String(object.id),
      externalRecordId: recording.id,
      externalUrl: object.join_url,
      recordingUrl: recording.download_url,
      mimeType: fileTypeToMimeType(recording.file_extension ?? recording.file_type),
      fileName: `${object.topic ?? "zoom-meeting"}.${(recording.file_extension ?? "mp4").toLowerCase()}`,
    });

    return { accepted: true };
  },
};

const teamsProvider: ProviderHandler = {
  async getStatus(userId) {
    return {
      provider: "teams",
      configured: Boolean(env.microsoftClientId && env.microsoftClientSecret && env.microsoftRedirectUri),
      connected: Boolean(await getMeetingProviderToken("teams", userId)),
      externalEmail: (await getMeetingProviderToken("teams", userId))?.externalEmail,
    };
  },

  getAuthorizationUrl(userId) {
    ensureConfig("teams");
    const params = new URLSearchParams({
      client_id: env.microsoftClientId ?? "",
      response_type: "code",
      redirect_uri: env.microsoftRedirectUri ?? "",
      response_mode: "query",
      scope: teamsScopes.join(" "),
      state: createState("teams", userId),
    });
    return `${MICROSOFT_LOGIN_BASE}/${env.microsoftTenantId}/oauth2/v2.0/authorize?${params.toString()}`;
  },

  async handleCallback(code, state) {
    ensureConfig("teams");
    const userId = parseState("teams", state);
    const response = await fetch(`${MICROSOFT_LOGIN_BASE}/${env.microsoftTenantId}/oauth2/v2.0/token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: env.microsoftClientId ?? "",
        client_secret: env.microsoftClientSecret ?? "",
        code,
        grant_type: "authorization_code",
        redirect_uri: env.microsoftRedirectUri ?? "",
        scope: teamsScopes.join(" "),
      }),
    });
    if (!response.ok) {
      throw new MeetingProviderIntegrationError(`Microsoft token exchange failed: ${await response.text()}`, response.status);
    }

    const body = (await response.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in: number;
      scope?: string;
    };

    const profileResponse = await fetch(`${MICROSOFT_GRAPH_BASE}/me`, {
      headers: {
        Authorization: `Bearer ${body.access_token}`,
        Accept: "application/json",
      },
    });
    const profile = profileResponse.ok
      ? ((await profileResponse.json()) as { id?: string; mail?: string; userPrincipalName?: string })
      : undefined;

    await saveMeetingProviderToken("teams", userId, {
      accessToken: body.access_token,
      refreshToken: body.refresh_token,
      expiresAt: new Date(Date.now() + body.expires_in * 1000).toISOString(),
      scope: body.scope,
      externalUserId: profile?.id,
      externalEmail: profile?.mail ?? profile?.userPrincipalName,
    });
  },

  async disconnect(userId) {
    await clearMeetingProviderToken("teams", userId);
    return { ok: true };
  },

  async importMeeting(userId, payload) {
    const token = await withTokenRefresh("teams", userId, async (current) => {
      const response = await fetch(`${MICROSOFT_LOGIN_BASE}/${env.microsoftTenantId}/oauth2/v2.0/token`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          client_id: env.microsoftClientId ?? "",
          client_secret: env.microsoftClientSecret ?? "",
          refresh_token: current.refreshToken ?? "",
          grant_type: "refresh_token",
          scope: teamsScopes.join(" "),
        }),
      });
      if (!response.ok) {
        throw new MeetingProviderIntegrationError(`Microsoft token refresh failed: ${await response.text()}`, response.status);
      }
      const body = (await response.json()) as {
        access_token: string;
        refresh_token?: string;
        expires_in: number;
        scope?: string;
      };
      return {
        accessToken: body.access_token,
        refreshToken: body.refresh_token ?? current.refreshToken,
        expiresAt: new Date(Date.now() + body.expires_in * 1000).toISOString(),
        scope: body.scope ?? current.scope,
        externalUserId: current.externalUserId,
        externalEmail: current.externalEmail,
        metadata: current.metadata,
      };
    });
    return importMeetingPayload(payload, token.accessToken);
  },

  async handleWebhook(body, headers) {
    const validationToken = Array.isArray(headers["validationtoken"]) ? headers["validationtoken"][0] : headers["validationtoken"];
    if (validationToken) {
      return { accepted: true };
    }

    const clientStateHeader = Array.isArray(headers["x-orbitplan-webhook-secret"])
      ? headers["x-orbitplan-webhook-secret"][0]
      : headers["x-orbitplan-webhook-secret"];
    if (env.teamsWebhookSecret && clientStateHeader !== env.teamsWebhookSecret) {
      throw new MeetingProviderIntegrationError("Invalid Teams webhook secret.", 401);
    }

    const payload = body as {
      value?: Array<{
        resourceData?: {
          id?: string;
          meetingId?: string;
          callId?: string;
          organizer?: { user?: { id?: string; email?: string } };
          transcriptContent?: string;
          recordingContentUrl?: string;
          contentType?: string;
        };
      }>;
    };

    for (const item of payload.value ?? []) {
      const data = item.resourceData;
      if (!data?.meetingId || !data.id) continue;
      const connection = await prismaMeetingProviderConnectionByExternal("teams", data.organizer?.user?.id);
      if (!connection) continue;

      await teamsProvider.importMeeting(connection.userId, {
        provider: "teams",
        title: "Microsoft Teams Meeting",
        attendees: data.organizer?.user?.email ? [data.organizer.user.email] : [],
        organizerEmail: data.organizer?.user?.email,
        externalMeetingId: data.meetingId,
        externalRecordId: data.callId ?? data.id,
        transcriptText: data.transcriptContent,
        recordingUrl: data.recordingContentUrl,
        mimeType: data.contentType,
        fileName: "teams-recording.mp4",
      });
    }

    return { accepted: true };
  },
};

const providers: Record<MeetingProvider, ProviderHandler> = {
  zoom: zoomProvider,
  teams: teamsProvider,
};

const fileTypeToMimeType = (value?: string) => {
  const normalized = value?.toLowerCase();
  switch (normalized) {
    case "mp4":
      return "video/mp4";
    case "m4a":
      return "audio/m4a";
    case "webm":
      return "video/webm";
    case "wav":
      return "audio/wav";
    case "mp3":
      return "audio/mpeg";
    default:
      return "video/mp4";
  }
};

const prismaMeetingProviderConnectionByExternal = async (provider: MeetingProvider, externalUserId?: string) => {
  if (!externalUserId) return null;
  const { prisma } = await import("../../lib/prisma.js");
  return prisma.meetingProviderConnection.findFirst({
    where: {
      provider,
      externalUserId,
    },
    select: {
      userId: true,
    },
  });
};

const importMeetingPayload = async (payload: ImportedMeetingInput, accessToken: string) => {
  const created = await createImportedMeeting({
    title: payload.title,
    scheduledAt: payload.scheduledAt,
    attendees: payload.attendees,
    provider: payload.provider,
    externalMeetingId: payload.externalMeetingId,
    externalRecordId: payload.externalRecordId,
    externalUrl: payload.externalUrl,
    organizerEmail: payload.organizerEmail,
  });

  const meetingId = created.meeting.id;
  if (payload.transcriptText) {
    const processed = await analyzeTranscript(meetingId, created.meeting.title, created.meeting.attendees, payload.transcriptText);
    return processed ?? created;
  }

  if (payload.recordingUrl) {
    const saved = await saveRemoteFile(
      payload.recordingUrl,
      accessToken,
      payload.fileName ?? `${payload.provider}-${payload.externalMeetingId}.mp4`,
    );
    await addMeetingFile(meetingId, {
      originalName: path.basename(saved.path),
      mimeType: payload.mimeType ?? saved.mimeType,
      size: saved.size,
      path: saved.path,
    });
    const transcriptionProvider = createTranscriptionProvider();
    const transcript = await transcriptionProvider.transcribe({
      filePath: saved.path,
      mimeType: payload.mimeType ?? saved.mimeType,
    });
    const processed = await analyzeTranscript(meetingId, created.meeting.title, created.meeting.attendees, transcript.text);
    return processed ?? (await getMeetingById(meetingId)) ?? created;
  }

  return getMeetingById(meetingId);
};

export const meetingProviders = {
  get(provider: MeetingProvider) {
    return providers[provider];
  },
};
