import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { env } from "../../config/env.js";
import { logger } from "../../lib/logger.js";
import { createAnalysisProvider } from "../analysis/index.js";
import { createTranscriptionProvider } from "../transcription/index.js";
import { addMeetingFile, createImportedMeeting, getMeetingById, markMeetingProcessFailed, processMeeting } from "../../storage/meetingsStore.js";
import type {
  ImportedMeetingInput,
  MeetingProviderConnectionStatus,
  MeetingProviderOAuthToken,
  MeetingProviderSyncResult,
} from "../../types/meetingProvider.js";
import type { MeetingProvider } from "../../types/meeting.js";
import {
  clearMeetingProviderToken,
  findMeetingProviderConnectionByExternalIdentifiers,
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

const fileTypeToExtension = (fileType?: string) => {
  switch ((fileType ?? "").toLowerCase()) {
    case "vtt":
      return "vtt";
    case "txt":
      return "txt";
    case "json":
      return "json";
    case "m4a":
      return "m4a";
    case "wav":
      return "wav";
    case "mp3":
      return "mp3";
    case "webm":
      return "webm";
    default:
      return "mp4";
  }
};

const fileTypeToMimeType = (value?: string) => {
  const normalized = value?.toLowerCase();
  switch (normalized) {
    case "vtt":
      return "text/vtt";
    case "txt":
      return "text/plain";
    case "json":
      return "application/json";
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

const fetchZoomProfile = async (accessToken: string) => {
  const response = await fetch("https://api.zoom.us/v2/users/me", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Zoom profile lookup failed: ${response.status} ${await response.text()}`);
  }

  return (await response.json()) as {
    id?: string;
    account_id?: string;
    email?: string;
  };
};

const saveRemoteFile = async (url: string, accessToken: string, preferredName: string, fallbackMimeType?: string) => {
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new MeetingProviderIntegrationError(`Failed to download provider recording: ${await response.text()}`, response.status);
  }

  const contentType = response.headers.get("content-type") ?? "application/octet-stream";
  const resolvedMimeType =
    contentType !== "application/octet-stream" && isMimeTypeSupported(contentType)
      ? contentType
      : fallbackMimeType && isMimeTypeSupported(fallbackMimeType)
        ? fallbackMimeType
        : contentType;
  if (!isMimeTypeSupported(resolvedMimeType)) {
    throw new MeetingProviderIntegrationError(`Unsupported provider media format: ${contentType}`, 400);
  }

  const bytes = Buffer.from(await response.arrayBuffer());
  await fs.mkdir(uploadsDir, { recursive: true });
  const filePath = path.join(uploadsDir, `${Date.now()}_${sanitizeFileName(preferredName)}`);
  await fs.writeFile(filePath, bytes);

  return {
    path: filePath,
    mimeType: resolvedMimeType,
    size: bytes.byteLength,
  };
};

const downloadRemoteText = async (url: string, accessToken: string) => {
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new MeetingProviderIntegrationError(`Failed to download provider transcript: ${await response.text()}`, response.status);
  }

  return response.text();
};

const toZoomDate = (value: Date) => value.toISOString().slice(0, 10);

const subtractMonthsUtc = (value: Date, months: number) =>
  new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth() - months, value.getUTCDate()));

type ZoomRecordingMeeting = {
  id?: number | string;
  uuid?: string;
  topic?: string;
  start_time?: string;
  host_email?: string;
  share_url?: string;
  recording_files?: Array<{
    id?: string;
    file_type?: string;
    file_extension?: string;
    recording_type?: string;
    download_url?: string;
  }>;
};

type ZoomRecordingFile = NonNullable<ZoomRecordingMeeting["recording_files"]>[number];

const isTranscriptRecordingFile = (file: ZoomRecordingFile) => {
  const fileType = (file.file_type ?? file.file_extension ?? "").toLowerCase();
  const recordingType = (file.recording_type ?? "").toLowerCase();
  return fileType === "vtt" || fileType === "txt" || fileType === "json" || recordingType.includes("transcript");
};

const selectZoomRecordingFile = (files?: ZoomRecordingMeeting["recording_files"]) =>
  files?.find((entry) => entry.download_url && !isTranscriptRecordingFile(entry));

const selectZoomTranscriptFile = (files?: ZoomRecordingMeeting["recording_files"]) =>
  files?.find((entry) => entry.download_url && isTranscriptRecordingFile(entry));

const listZoomRecordings = async (accessToken: string): Promise<ZoomRecordingMeeting[]> => {
  const now = new Date();
  const windows = Array.from({ length: 6 }, (_, index) => {
    const fromDate = subtractMonthsUtc(now, index + 1);
    const toDate = subtractMonthsUtc(now, index);
    return {
      from: toZoomDate(fromDate),
      to: toZoomDate(toDate),
    };
  });

  const meetings = new Map<string, ZoomRecordingMeeting>();

  for (const window of windows) {
    let nextPageToken = "";

    do {
      const params = new URLSearchParams({
        page_size: "100",
        from: window.from,
        to: window.to,
      });
      if (nextPageToken) params.set("next_page_token", nextPageToken);

      const response = await fetch(`https://api.zoom.us/v2/users/me/recordings?${params.toString()}`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });
      if (!response.ok) {
        throw new MeetingProviderIntegrationError(`Zoom recordings sync failed: ${await response.text()}`, response.status);
      }

      const body = (await response.json()) as {
        meetings?: ZoomRecordingMeeting[];
        next_page_token?: string;
      };

      for (const meeting of body.meetings ?? []) {
        if (!meeting.id) continue;
        meetings.set(String(meeting.id), meeting);
      }

      nextPageToken = body.next_page_token ?? "";
    } while (nextPageToken);
  }

  return [...meetings.values()];
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
  syncInbox(userId: string): Promise<MeetingProviderSyncResult>;
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

const defaultZoomScopes = [
  "cloud_recording:read:recording:admin",
  "cloud_recording:read:list_user_recordings:admin",
  "user:read:user:admin",
];

const getZoomScopes = () => {
  if (env.zoomScopes === undefined) return defaultZoomScopes;
  return env.zoomScopes
    .split(/[,\s]+/)
    .map((value) => value.trim())
    .filter(Boolean);
};

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
    const zoomScopes = getZoomScopes();
    const params = new URLSearchParams({
      response_type: "code",
      client_id: env.zoomClientId ?? "",
      redirect_uri: env.zoomRedirectUri ?? "",
      state: createState("zoom", userId),
    });
    if (zoomScopes.length > 0) {
      params.set("scope", zoomScopes.join(" "));
    }
    const url = `${ZOOM_OAUTH_BASE}/authorize?${params.toString()}`;
    logger.info("integrations.zoom.oauth.authorize_url_generated", {
      redirectUri: env.zoomRedirectUri,
      requestedScopes: zoomScopes,
      hasScopeParam: zoomScopes.length > 0,
    });
    return url;
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
    let zoomProfile:
      | {
          id?: string;
          account_id?: string;
          email?: string;
        }
      | undefined;
    try {
      zoomProfile = await fetchZoomProfile(body.access_token);
    } catch (error) {
      logger.warn("integrations.zoom.profile_lookup_failed", {
        message: error instanceof Error ? error.message : String(error),
      });
    }
    await saveMeetingProviderToken("zoom", userId, {
      accessToken: body.access_token,
      refreshToken: body.refresh_token,
      expiresAt: new Date(Date.now() + body.expires_in * 1000).toISOString(),
      scope: body.scope,
      externalUserId: zoomProfile?.account_id ?? body.uid,
      externalEmail: zoomProfile?.email,
      metadata: {
        zoomAccountId: zoomProfile?.account_id,
        zoomUserId: zoomProfile?.id ?? body.uid,
      },
    });
  },

  async disconnect(userId) {
    await clearMeetingProviderToken("zoom", userId);
    return { ok: true };
  },

  async syncInbox(userId) {
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

    const meetings = await listZoomRecordings(token.accessToken);

    let imported = 0;
    let skipped = 0;
    for (const meeting of meetings) {
      const recording = selectZoomRecordingFile(meeting.recording_files);
      const transcriptFile = selectZoomTranscriptFile(meeting.recording_files);
      if (!meeting.id || (!recording?.download_url && !transcriptFile?.download_url)) {
        skipped += 1;
        continue;
      }

      try {
        const transcriptText = transcriptFile?.download_url
          ? await downloadRemoteText(transcriptFile.download_url, token.accessToken)
          : undefined;
        await zoomProvider.importMeeting(userId, {
          provider: "zoom",
          title: meeting.topic ?? "Zoom Meeting",
          scheduledAt: meeting.start_time,
          organizerEmail: meeting.host_email,
          externalMeetingId: String(meeting.id),
          externalRecordId: recording?.id ?? transcriptFile?.id ?? meeting.uuid ?? String(meeting.id),
          externalUrl: meeting.share_url,
          transcriptText: transcriptText?.trim() || undefined,
          recordingUrl: recording?.download_url,
          mimeType: recording ? fileTypeToMimeType(recording.file_extension ?? recording.file_type) : undefined,
          fileName: recording
            ? `${meeting.topic ?? "zoom-meeting"}.${fileTypeToExtension(recording.file_extension ?? recording.file_type)}`
            : undefined,
        });
        imported += 1;
      } catch (error) {
        logger.warn("integrations.zoom.sync.import_failed", {
          meetingId: String(meeting.id),
          message: error instanceof Error ? error.message : String(error),
        });
        skipped += 1;
      }
    }

    return {
      imported,
      skipped,
      total: meetings.length,
    };
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
          host_id?: string;
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
    const recording = selectZoomRecordingFile(object?.recording_files);
    const transcriptFile = selectZoomTranscriptFile(object?.recording_files);
    if (!object?.id || (!recording?.download_url && !transcriptFile?.download_url)) {
      return { accepted: true };
    }

    const connection = await findMeetingProviderConnectionByExternalIdentifiers("zoom", [
      payload.payload?.account_id ?? "",
      object.host_id ?? "",
    ]);
    if (!connection) return { accepted: true };

    await zoomProvider.importMeeting(connection.userId, {
      provider: "zoom",
      title: object.topic ?? "Zoom Meeting",
      scheduledAt: object.start_time,
      attendees: (object.participants ?? []).map((item) => item.user_email).filter((value): value is string => Boolean(value)),
      organizerEmail: object.host_email,
      externalMeetingId: String(object.id),
      externalRecordId: recording?.id ?? transcriptFile?.id,
      externalUrl: object.join_url,
      recordingUrl: recording?.download_url,
      mimeType: recording ? fileTypeToMimeType(recording.file_extension ?? recording.file_type) : undefined,
      fileName: recording ? `${object.topic ?? "zoom-meeting"}.${(recording.file_extension ?? "mp4").toLowerCase()}` : undefined,
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

  async syncInbox(userId) {
    void userId;
    return {
      imported: 0,
      skipped: 0,
      total: 0,
    };
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
      const connection = await findMeetingProviderConnectionByExternalIdentifiers("teams", [data.organizer?.user?.id ?? ""]);
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
  try {
    if (payload.transcriptText) {
      const processed = await analyzeTranscript(meetingId, created.meeting.title, created.meeting.attendees, payload.transcriptText);
      return processed ?? created;
    }

    if (payload.recordingUrl) {
      const saved = await saveRemoteFile(
        payload.recordingUrl,
        accessToken,
        payload.fileName ?? `${payload.provider}-${payload.externalMeetingId}.mp4`,
        payload.mimeType,
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
  } catch (error) {
    const message = error instanceof Error ? error.message : "Provider import failed";
    logger.error("integrations.meeting_provider.import_failed", {
      provider: payload.provider,
      meetingId,
      externalMeetingId: payload.externalMeetingId,
      message,
    });
    await markMeetingProcessFailed(meetingId, message);
    throw error;
  }
};

export const meetingProviders = {
  get(provider: MeetingProvider) {
    return providers[provider];
  },
};
