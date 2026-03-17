import { config } from "@/lib/config";
import type { MeetingCreateDTO } from "@/dto/meetings";
import type { ActionPriority, ActionStatus } from "@/types/action";
import type { AuthUser } from "@/types/auth";
import type { EmailExportResult } from "@/types/execution";
import type { JiraExportResult, JiraIntegrationStatus, JiraIssueTypeCreateMeta, JiraLookupItem, JiraProject, JiraScanResult, JiraSite } from "@/types/jira";
import type { Meeting } from "@/types/meeting";
import type { MeetingChatHistoryResponse, MeetingChatResponse } from "@/types/chat";
import type { MeetingDetail } from "@/types/meetingDetail";

type ApiError = {
  error?: string;
  details?: string;
  code?: string;
};

export class ApiRequestError extends Error {
  status: number;
  code?: string;
  details?: string;

  constructor(message: string, options: { status: number; code?: string; details?: string }) {
    super(message);
    this.name = "ApiRequestError";
    this.status = options.status;
    this.code = options.code;
    this.details = options.details;
  }
}

export const getProcessingErrorMessage = (error: unknown): string => {
  if (error instanceof ApiRequestError) {
    if (error.code === "invalid_format") {
      return "Unsupported or invalid media format. Use MP3, WAV, M4A, MP4, or WEBM.";
    }
    if (error.code === "timeout") {
      return "Processing took too long. Retry now, or try a shorter recording.";
    }
    if (error.code === "quota") {
      return "AI quota/rate limit reached. Check your OpenAI billing, then retry.";
    }
    if (error.code === "provider_error") {
      return "AI provider error occurred. Retry in a moment.";
    }
  }

  if (error instanceof Error) return error.message;
  return "Upload flow failed";
};

const toError = async (response: Response): Promise<never> => {
  let message = `Request failed (${response.status})`;
  let code: string | undefined;
  let details: string | undefined;
  try {
    const body = (await response.json()) as ApiError;
    if (body.error && body.details) {
      message = `${body.error}: ${body.details}`;
      details = body.details;
    } else if (body.error) {
      message = body.error;
    }
    code = body.code;
  } catch {
    // Ignore malformed error body.
  }
  throw new ApiRequestError(message, { status: response.status, code, details });
};

const apiFetch = async (input: string, init?: RequestInit) => {
  try {
    return await fetch(input, {
      ...init,
      credentials: "include",
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? `Unable to reach the OrbitPlan API at ${config.apiBaseUrl}. Check that the API is running and NEXT_PUBLIC_API_BASE_URL is correct.`
        : "Unable to reach the OrbitPlan API.";
    throw new ApiRequestError(message, { status: 0, details: error instanceof Error ? error.message : undefined });
  }
};

export const createMeeting = async (payload: MeetingCreateDTO): Promise<Meeting> => {
  const response = await apiFetch(`${config.apiBaseUrl}/api/meetings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) return toError(response);
  return (await response.json()) as Meeting;
};

export const uploadMeetingFile = async (meetingId: string, file: File) => {
  const formData = new FormData();
  formData.append("file", file);

  const response = await apiFetch(`${config.apiBaseUrl}/api/meetings/${meetingId}/upload`, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) return toError(response);
  return response.json();
};

export const processMeeting = async (meetingId: string): Promise<MeetingDetail> => {
  const response = await apiFetch(`${config.apiBaseUrl}/api/meetings/${meetingId}/process`, {
    method: "POST",
  });

  if (!response.ok) return toError(response);
  return (await response.json()) as MeetingDetail;
};

export const getMeeting = async (meetingId: string): Promise<MeetingDetail> => {
  const response = await apiFetch(`${config.apiBaseUrl}/api/meetings/${meetingId}`, {
    method: "GET",
    cache: "no-store",
  });

  if (!response.ok) return toError(response);
  return (await response.json()) as MeetingDetail;
};

export const approveMeeting = async (meetingId: string): Promise<MeetingDetail> => {
  const response = await apiFetch(`${config.apiBaseUrl}/api/meetings/${meetingId}/approve`, {
    method: "POST",
  });

  if (!response.ok) return toError(response);
  return (await response.json()) as MeetingDetail;
};

export const askMeetingQuestion = async (meetingId: string, question: string): Promise<MeetingChatResponse> => {
  const response = await apiFetch(`${config.apiBaseUrl}/api/meetings/${meetingId}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question }),
  });

  if (!response.ok) return toError(response);
  return (await response.json()) as MeetingChatResponse;
};

export const getMeetingChatHistory = async (
  meetingId: string,
  options?: { limit?: number; before?: string },
): Promise<MeetingChatHistoryResponse> => {
  const params = new URLSearchParams();
  if (options?.limit) params.set("limit", String(options.limit));
  if (options?.before) params.set("before", options.before);
  const query = params.toString();
  const response = await apiFetch(`${config.apiBaseUrl}/api/meetings/${meetingId}/chat${query ? `?${query}` : ""}`, {
    method: "GET",
    cache: "no-store",
  });

  if (!response.ok) return toError(response);
  return (await response.json()) as MeetingChatHistoryResponse;
};

export const clearMeetingChatHistory = async (meetingId: string): Promise<{ cleared: number }> => {
  const response = await apiFetch(`${config.apiBaseUrl}/api/meetings/${meetingId}/chat`, {
    method: "DELETE",
  });

  if (!response.ok) return toError(response);
  return (await response.json()) as { cleared: number };
};

export const updateMeetingAction = async (
  meetingId: string,
  actionId: string,
  payload: { status?: ActionStatus; priority?: ActionPriority },
): Promise<MeetingDetail> => {
  const response = await apiFetch(`${config.apiBaseUrl}/api/meetings/${meetingId}/actions/${actionId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) return toError(response);
  return (await response.json()) as MeetingDetail;
};

export const deleteMeetingAction = async (meetingId: string, actionId: string): Promise<MeetingDetail> => {
  const response = await apiFetch(`${config.apiBaseUrl}/api/meetings/${meetingId}/actions/${actionId}`, {
    method: "DELETE",
  });

  if (!response.ok) return toError(response);
  return (await response.json()) as MeetingDetail;
};

export const resyncMeetingAction = async (meetingId: string, actionId: string): Promise<MeetingDetail> => {
  const response = await apiFetch(`${config.apiBaseUrl}/api/meetings/${meetingId}/actions/${actionId}/resync-jira`, {
    method: "POST",
  });

  if (!response.ok) return toError(response);
  return (await response.json()) as MeetingDetail;
};

export const confirmMeetingActions = async (meetingId: string, confirmed: boolean): Promise<MeetingDetail> => {
  const response = await apiFetch(`${config.apiBaseUrl}/api/meetings/${meetingId}/actions/confirm`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ confirmed }),
  });

  if (!response.ok) return toError(response);
  return (await response.json()) as MeetingDetail;
};

export const getJiraStatus = async (): Promise<JiraIntegrationStatus> => {
  const response = await apiFetch(`${config.apiBaseUrl}/api/integrations/jira/status`, { cache: "no-store" });
  if (!response.ok) return toError(response);
  return (await response.json()) as JiraIntegrationStatus;
};

export const getJiraAuthUrl = async (): Promise<string> => {
  const response = await apiFetch(`${config.apiBaseUrl}/api/integrations/jira/auth-url`, { cache: "no-store" });
  if (!response.ok) return toError(response);
  const data = (await response.json()) as { url: string };
  return data.url;
};

export const disconnectJira = async (): Promise<void> => {
  const response = await apiFetch(`${config.apiBaseUrl}/api/integrations/jira/disconnect`, {
    method: "POST",
  });
  if (!response.ok) return toError(response);
};

export const getJiraSites = async (): Promise<JiraSite[]> => {
  const response = await apiFetch(`${config.apiBaseUrl}/api/integrations/jira/sites`, { cache: "no-store" });
  if (!response.ok) return toError(response);
  const data = (await response.json()) as { sites: JiraSite[] };
  return data.sites;
};

export const getJiraProjects = async (cloudId: string): Promise<JiraProject[]> => {
  const params = new URLSearchParams({ cloudId });
  const response = await apiFetch(`${config.apiBaseUrl}/api/integrations/jira/projects?${params.toString()}`, { cache: "no-store" });
  if (!response.ok) return toError(response);
  const data = (await response.json()) as { projects: JiraProject[] };
  return data.projects;
};

export const getJiraCreateMeta = async (cloudId: string, projectKey: string): Promise<JiraIssueTypeCreateMeta[]> => {
  const params = new URLSearchParams({ cloudId, projectKey });
  const response = await apiFetch(`${config.apiBaseUrl}/api/integrations/jira/create-meta?${params.toString()}`, {
    cache: "no-store",
  });
  if (!response.ok) return toError(response);
  const data = (await response.json()) as { issueTypes: JiraIssueTypeCreateMeta[] };
  return data.issueTypes;
};

export const getJiraLookup = async (
  cloudId: string,
  projectKey: string,
  kind: "user" | "issue" | "epic" | "sprint",
  query: string,
): Promise<JiraLookupItem[]> => {
  const params = new URLSearchParams({ cloudId, projectKey, kind, query });
  const response = await apiFetch(`${config.apiBaseUrl}/api/integrations/jira/lookup?${params.toString()}`, {
    cache: "no-store",
  });
  if (!response.ok) return toError(response);
  const data = (await response.json()) as { items: JiraLookupItem[] };
  return data.items;
};

export const exportMeetingToJira = async (payload: {
  meetingId: string;
  cloudId: string;
  projectKey: string;
  ticketFormatPreset?: "enterprise" | "engineering" | "operations" | "compliance";
  ticketDetails?: {
    issueType?: string;
    labels?: string[];
    components?: string[];
    environment?: string;
    additionalContext?: string;
    advancedFields?: Record<string, unknown>;
  };
}): Promise<JiraExportResult> => {
  const response = await apiFetch(`${config.apiBaseUrl}/api/integrations/jira/export`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) return toError(response);
  return (await response.json()) as JiraExportResult;
};

export const scanMeetingToJira = async (payload: {
  meetingId: string;
  cloudId: string;
  projectKey: string;
  ticketFormatPreset?: "enterprise" | "engineering" | "operations" | "compliance";
  ticketDetails?: {
    issueType?: string;
    labels?: string[];
    components?: string[];
    environment?: string;
    additionalContext?: string;
    advancedFields?: Record<string, unknown>;
  };
}): Promise<JiraScanResult> => {
  const response = await apiFetch(`${config.apiBaseUrl}/api/integrations/jira/scan`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) return toError(response);
  return (await response.json()) as JiraScanResult;
};

export const exportMeetingToEmail = async (payload: {
  meetingId: string;
  ticketFormatPreset?: "enterprise" | "engineering" | "operations" | "compliance";
  recipientMode: "attendees" | "owners" | "custom";
  recipients?: string[];
  subject?: string;
}): Promise<EmailExportResult> => {
  const response = await apiFetch(`${config.apiBaseUrl}/api/integrations/email/export`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) return toError(response);
  return (await response.json()) as EmailExportResult;
};

export const login = async (payload: { email: string; password: string }): Promise<AuthUser> => {
  const response = await apiFetch(`${config.apiBaseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) return toError(response);
  const data = (await response.json()) as { user: AuthUser };
  return data.user;
};

export const logout = async (): Promise<void> => {
  const response = await apiFetch(`${config.apiBaseUrl}/api/auth/logout`, { method: "POST" });
  if (!response.ok) return toError(response);
};

export const getCurrentUser = async (): Promise<AuthUser | null> => {
  const response = await apiFetch(`${config.apiBaseUrl}/api/auth/me`, { cache: "no-store" });
  if (response.status === 401) return null;
  if (!response.ok) return toError(response);
  const data = (await response.json()) as { user: AuthUser };
  return data.user;
};

export const getGoogleAuthUrl = async (): Promise<string> => {
  const response = await apiFetch(`${config.apiBaseUrl}/api/auth/google/url`, { cache: "no-store" });
  if (!response.ok) return toError(response);
  const data = (await response.json()) as { url: string };
  return data.url;
};
