import { URLSearchParams } from "node:url";
import { env } from "../../config/env.js";
import { clearJiraToken, getJiraToken, saveJiraToken } from "../../storage/jiraConnectionStore.js";
import { getMeetingById, setActionJiraSyncState, updateActionFromJira } from "../../storage/meetingsStore.js";
import type {
  JiraCreateFieldMeta,
  JiraCreateFieldOption,
  JiraIssueTypeCreateMeta,
  JiraLookupItem,
  JiraOAuthToken,
  JiraProject,
  JiraSite,
} from "../../types/jira.js";
import type { ActionItem, ActionPriority, ActionStatus } from "../../types/action.js";

const ATLASSIAN_AUTH_BASE = "https://auth.atlassian.com";
const ATLASSIAN_API_BASE = "https://api.atlassian.com";
const OAUTH_SCOPES = [
  "offline_access",
  "read:jira-work",
  "write:jira-work",
  "read:jira-user",
  "read:board-scope:jira-software",
  "read:sprint:jira-software",
];
const TOKEN_REFRESH_WINDOW_MS = 60_000;

class JiraIntegrationError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "JiraIntegrationError";
    this.status = status;
  }
}

const requireConfig = () => {
  if (!env.jiraClientId || !env.jiraClientSecret || !env.jiraRedirectUri) {
    throw new JiraIntegrationError(
      "Jira integration is not configured. Set JIRA_CLIENT_ID, JIRA_CLIENT_SECRET, and JIRA_REDIRECT_URI.",
      503,
    );
  }
};

const toBasicAuth = () => {
  requireConfig();
  return Buffer.from(`${env.jiraClientId}:${env.jiraClientSecret}`).toString("base64");
};

const exchangeToken = async (params: Record<string, string>) => {
  const response = await fetch(`${ATLASSIAN_AUTH_BASE}/oauth/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${toBasicAuth()}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new JiraIntegrationError(`Jira token exchange failed: ${body}`, response.status);
  }

  const body = (await response.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    scope?: string;
  };

  const token: JiraOAuthToken = {
    accessToken: body.access_token,
    refreshToken: body.refresh_token,
    scope: body.scope,
    expiresAt: new Date(Date.now() + body.expires_in * 1000).toISOString(),
  };
  await saveJiraToken(token);
  return token;
};

const ensureValidToken = async (): Promise<JiraOAuthToken> => {
  const token = await getJiraToken();
  if (!token) {
    throw new JiraIntegrationError("Jira is not connected yet.", 401);
  }

  if (new Date(token.expiresAt).getTime() - Date.now() > TOKEN_REFRESH_WINDOW_MS) {
    return token;
  }

  if (!token.refreshToken) {
    throw new JiraIntegrationError("Jira token expired and no refresh token is available. Reconnect Jira.", 401);
  }

  return exchangeToken({
    grant_type: "refresh_token",
    refresh_token: token.refreshToken,
    client_id: env.jiraClientId ?? "",
    client_secret: env.jiraClientSecret ?? "",
  });
};

const jiraApi = async <T>(path: string, init?: RequestInit): Promise<T> => {
  const token = await ensureValidToken();
  const response = await fetch(path, {
    ...init,
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token.accessToken}`,
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new JiraIntegrationError(`Jira API request failed: ${body}`, response.status);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
};

const toPriorityLabel = (priority: string) => (priority === "high" ? "High" : priority === "low" ? "Low" : "Medium");
const fromJiraPriorityLabel = (priority?: string | null): ActionPriority => {
  const normalized = priority?.toLowerCase() ?? "";
  if (normalized.includes("highest") || normalized.includes("high")) return "high";
  if (normalized.includes("lowest") || normalized.includes("low")) return "low";
  return "medium";
};
const fromJiraStatusName = (status?: string | null): ActionStatus => {
  const normalized = status?.toLowerCase() ?? "";
  if (normalized.includes("progress") || normalized.includes("develop")) return "in_progress";
  if (normalized.includes("done") || normalized.includes("closed") || normalized.includes("resolved")) return "done";
  return "open";
};
const toCreateFieldOption = (value: unknown): JiraCreateFieldOption | null => {
  if (!value || typeof value !== "object") return null;
  const entry = value as {
    id?: string | number;
    name?: string;
    value?: string;
    displayName?: string;
    children?: unknown[];
  };
  const id = entry.id != null ? String(entry.id) : entry.value ?? entry.name ?? entry.displayName;
  const label = entry.name ?? entry.value ?? entry.displayName ?? id;
  return id && label
    ? {
        id,
        label,
        children: (entry.children ?? [])
          .map(toCreateFieldOption)
          .filter((option): option is JiraCreateFieldOption => Boolean(option)),
      }
    : null;
};
const toCreateFieldMeta = (key: string, value: unknown): JiraCreateFieldMeta | null => {
  if (!value || typeof value !== "object") return null;
  const field = value as {
    name?: string;
    required?: boolean;
    schema?: { type?: string; items?: string; custom?: string };
    allowedValues?: unknown[];
  };
  if (!field.name) return null;
  return {
    key,
    name: field.name,
    required: Boolean(field.required),
    schemaType: field.schema?.type,
    itemsType: field.schema?.items,
    custom: field.schema?.custom,
    allowedValues: (field.allowedValues ?? []).map(toCreateFieldOption).filter((option): option is JiraCreateFieldOption => Boolean(option)),
  };
};
const toJiraStatusCandidates = (status: ActionStatus) => {
  switch (status) {
    case "in_progress":
      return ["In Progress", "In Development", "Doing"];
    case "done":
      return ["Done", "Closed", "Resolved"];
    case "open":
    default:
      return ["To Do", "Open", "Selected for Development", "Backlog"];
  }
};

export const jiraIntegration = {
  isConfigured() {
    return Boolean(env.jiraClientId && env.jiraClientSecret && env.jiraRedirectUri);
  },

  getAuthorizationUrl() {
    requireConfig();
    const params = new URLSearchParams({
      audience: "api.atlassian.com",
      client_id: env.jiraClientId ?? "",
      scope: OAUTH_SCOPES.join(" "),
      redirect_uri: env.jiraRedirectUri ?? "",
      state: "orbitplan-jira",
      response_type: "code",
      prompt: "consent",
    });
    return `${ATLASSIAN_AUTH_BASE}/authorize?${params.toString()}`;
  },

  async handleCallback(code: string) {
    requireConfig();
    return exchangeToken({
      grant_type: "authorization_code",
      client_id: env.jiraClientId ?? "",
      client_secret: env.jiraClientSecret ?? "",
      code,
      redirect_uri: env.jiraRedirectUri ?? "",
    });
  },

  async getStatus() {
    return {
      configured: this.isConfigured(),
      connected: Boolean(await getJiraToken()),
    };
  },

  async disconnect() {
    await clearJiraToken();
    return { ok: true };
  },

  async listSites(): Promise<JiraSite[]> {
    type AccessibleResource = {
      id: string;
      name: string;
      url: string;
      scopes?: string[];
    };

    const resources = await jiraApi<AccessibleResource[]>(`${ATLASSIAN_API_BASE}/oauth/token/accessible-resources`);
    return resources
      .filter((resource) => resource.url && resource.name)
      .map((resource) => ({
        id: resource.id,
        name: resource.name,
        url: resource.url,
      }));
  },

  async listProjects(cloudId: string): Promise<JiraProject[]> {
    const result = await jiraApi<{ values?: Array<{ id: string; key: string; name: string }> }>(
      `https://api.atlassian.com/ex/jira/${cloudId}/rest/api/3/project/search`,
    );
    return (result.values ?? []).map((project) => ({
      id: project.id,
      key: project.key,
      name: project.name,
    }));
  },

  async getCreateMeta(cloudId: string, projectKey: string): Promise<JiraIssueTypeCreateMeta[]> {
    const result = await jiraApi<{
      projects?: Array<{
        key: string;
        issuetypes?: Array<{
          id: string;
          name: string;
          description?: string;
          fields?: Record<string, unknown>;
        }>;
      }>;
    }>(
      `https://api.atlassian.com/ex/jira/${cloudId}/rest/api/3/issue/createmeta?projectKeys=${encodeURIComponent(projectKey)}&expand=projects.issuetypes.fields`,
    );

    const project = (result.projects ?? []).find((entry) => entry.key === projectKey) ?? result.projects?.[0];
    return (project?.issuetypes ?? []).map((issueType) => ({
      id: issueType.id,
      name: issueType.name,
      description: issueType.description,
      fields: Object.entries(issueType.fields ?? {})
        .map(([key, value]) => toCreateFieldMeta(key, value))
        .filter((field): field is JiraCreateFieldMeta => Boolean(field))
        .sort((a, b) => a.name.localeCompare(b.name)),
    }));
  },

  async lookupUsers(cloudId: string, projectKey: string, query: string): Promise<JiraLookupItem[]> {
    const result = await jiraApi<Array<{ accountId: string; displayName: string; emailAddress?: string }>>(
      `https://api.atlassian.com/ex/jira/${cloudId}/rest/api/3/user/assignable/multiProjectSearch?projectKeys=${encodeURIComponent(projectKey)}&query=${encodeURIComponent(query)}&maxResults=20`,
    );
    return result.map((user) => ({
      id: user.accountId,
      label: user.displayName,
      secondary: user.emailAddress,
    }));
  },

  async lookupIssues(cloudId: string, projectKey: string, query: string): Promise<JiraLookupItem[]> {
    const jql = `project = "${projectKey}" AND summary ~ "${query.replace(/"/g, '\\"')}" ORDER BY updated DESC`;
    const result = await jiraApi<{
      issues?: Array<{ id: string; key: string; fields?: { summary?: string } }>;
    }>(
      `https://api.atlassian.com/ex/jira/${cloudId}/rest/api/3/search/jql?maxResults=20&fields=summary&jql=${encodeURIComponent(jql)}`,
    );
    return (result.issues ?? []).map((issue) => ({
      id: issue.id,
      label: issue.key,
      secondary: issue.fields?.summary,
    }));
  },

  async lookupEpics(cloudId: string, projectKey: string, query: string): Promise<JiraLookupItem[]> {
    const jql = `project = "${projectKey}" AND issuetype = Epic AND summary ~ "${query.replace(/"/g, '\\"')}" ORDER BY updated DESC`;
    const result = await jiraApi<{
      issues?: Array<{ id: string; key: string; fields?: { summary?: string } }>;
    }>(
      `https://api.atlassian.com/ex/jira/${cloudId}/rest/api/3/search/jql?maxResults=20&fields=summary&jql=${encodeURIComponent(jql)}`,
    );
    return (result.issues ?? []).map((issue) => ({
      id: issue.id,
      label: issue.key,
      secondary: issue.fields?.summary,
    }));
  },

  async lookupSprints(cloudId: string, projectKey: string, query: string): Promise<JiraLookupItem[]> {
    const boards = await jiraApi<{
      values?: Array<{ id: number; name: string }>;
    }>(
      `https://api.atlassian.com/ex/jira/${cloudId}/rest/agile/1.0/board?projectKeyOrId=${encodeURIComponent(projectKey)}&maxResults=10`,
    );

    const items: JiraLookupItem[] = [];
    for (const board of boards.values ?? []) {
      const sprints = await jiraApi<{
        values?: Array<{ id: number; name: string; state?: string }>;
      }>(
        `https://api.atlassian.com/ex/jira/${cloudId}/rest/agile/1.0/board/${board.id}/sprint?maxResults=50&state=active,future,closed`,
      );
      for (const sprint of sprints.values ?? []) {
        if (!sprint.name.toLowerCase().includes(query.toLowerCase())) continue;
        items.push({
          id: String(sprint.id),
          label: sprint.name,
          secondary: `${board.name}${sprint.state ? ` - ${sprint.state}` : ""}`,
        });
      }
    }

    return items.slice(0, 20);
  },

  async getIssue(cloudId: string, issueKey: string) {
    return jiraApi<{
      key: string;
      fields: {
        summary?: string;
        duedate?: string | null;
        priority?: { name?: string | null } | null;
        status?: { name?: string | null } | null;
      };
    }>(`https://api.atlassian.com/ex/jira/${cloudId}/rest/api/3/issue/${issueKey}?fields=summary,duedate,priority,status`);
  },

  async createIssue(cloudId: string, fields: Record<string, unknown>) {
    return jiraApi<{ key: string }>(`https://api.atlassian.com/ex/jira/${cloudId}/rest/api/3/issue`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ fields }),
    });
  },

  async transitionIssueStatus(cloudId: string, issueKey: string, status: ActionStatus) {
    const transitions = await jiraApi<{ transitions?: Array<{ id: string; name: string }> }>(
      `https://api.atlassian.com/ex/jira/${cloudId}/rest/api/3/issue/${issueKey}/transitions`,
    );
    const target = (transitions.transitions ?? []).find((transition) =>
      toJiraStatusCandidates(status).some((candidate) => transition.name.toLowerCase() === candidate.toLowerCase()),
    );
    if (!target) return;

    await jiraApi<unknown>(`https://api.atlassian.com/ex/jira/${cloudId}/rest/api/3/issue/${issueKey}/transitions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        transition: {
          id: target.id,
        },
      }),
    });
  },

  async syncActionToJira(action: ActionItem) {
    if (!action.jiraCloudId || !action.jiraIssueKey) return;
    try {
      await jiraApi<unknown>(`https://api.atlassian.com/ex/jira/${action.jiraCloudId}/rest/api/3/issue/${action.jiraIssueKey}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          fields: {
            summary: action.description,
            ...(action.dueDate ? { duedate: action.dueDate } : { duedate: null }),
            priority: {
              name: toPriorityLabel(action.priority),
            },
          },
        }),
      });

      await this.transitionIssueStatus(action.jiraCloudId, action.jiraIssueKey, action.status);
      await setActionJiraSyncState(action.id, { jiraSyncStatus: "synced", jiraSyncError: null });
    } catch (error) {
      await setActionJiraSyncState(action.id, {
        jiraSyncStatus: "sync_failed",
        jiraSyncError: error instanceof Error ? error.message : "Unknown Jira sync error",
      });
      throw error;
    }
  },

  async syncMeetingActions(meetingId: string) {
    const meeting = await getMeetingById(meetingId);
    if (!meeting) {
      throw new JiraIntegrationError("Meeting not found", 404);
    }

    for (const action of meeting.actions) {
      if (!action.jiraCloudId || !action.jiraIssueKey) continue;
      try {
        const issue = await this.getIssue(action.jiraCloudId, action.jiraIssueKey);
        await updateActionFromJira(action.id, {
          description: issue.fields.summary || action.description,
          dueDate: issue.fields.duedate ?? null,
          priority: fromJiraPriorityLabel(issue.fields.priority?.name),
          status: fromJiraStatusName(issue.fields.status?.name),
        });
        await setActionJiraSyncState(action.id, { jiraSyncStatus: "synced", jiraSyncError: null });
      } catch (error) {
        await setActionJiraSyncState(action.id, {
          jiraSyncStatus: "sync_failed",
          jiraSyncError: error instanceof Error ? error.message : "Unknown Jira sync error",
        });
        if (!(error instanceof JiraIntegrationError) || error.status >= 500) {
          throw error;
        }
      }
    }
  },
};

export { JiraIntegrationError };
