import type { Request, Response } from "express";
import { z } from "zod";
import { ExecutionError, executionService } from "../services/execution/index.js";
import { JiraIntegrationError, jiraIntegration } from "../services/integrations/jira.js";
import { MeetingProviderIntegrationError, meetingProviders } from "../services/integrations/meetingProviders.js";
import { listImportedMeetingsByProvider } from "../storage/meetingsStore.js";
import type { MeetingProvider } from "../types/meeting.js";

const JiraExportSchema = z.object({
  meetingId: z.string().uuid(),
  cloudId: z.string().min(1),
  projectKey: z.string().min(1),
  ticketFormatPreset: z.enum(["enterprise", "engineering", "operations", "compliance"]).optional(),
  ticketDetails: z
    .object({
      issueType: z.string().min(1).optional(),
      labels: z.array(z.string().min(1)).optional(),
      components: z.array(z.string().min(1)).optional(),
      environment: z.string().optional(),
      additionalContext: z.string().optional(),
      advancedFields: z.record(z.string(), z.unknown()).optional(),
    })
    .optional(),
});
const JiraScanSchema = JiraExportSchema;
const EmailExportSchema = z.object({
  meetingId: z.string().uuid(),
  ticketFormatPreset: z.enum(["enterprise", "engineering", "operations", "compliance"]).optional(),
  recipientMode: z.enum(["attendees", "owners", "custom"]),
  recipients: z.array(z.string().email()).optional(),
  subject: z.string().min(1).optional(),
});
const MeetingImportSchema = z.object({
  title: z.string().min(1),
  scheduledAt: z.string().datetime().optional(),
  attendees: z.array(z.string().email()).optional(),
  organizerEmail: z.string().email().optional(),
  externalMeetingId: z.string().min(1),
  externalRecordId: z.string().min(1).optional(),
  externalUrl: z.string().url().optional(),
  transcriptText: z.string().min(1).optional(),
  recordingUrl: z.string().url().optional(),
  mimeType: z.string().min(1).optional(),
  fileName: z.string().min(1).optional(),
}).refine((data) => data.transcriptText || data.recordingUrl, {
  message: "transcriptText or recordingUrl is required",
});

const handleJiraError = (res: Response, error: unknown) => {
  if (error instanceof JiraIntegrationError) {
    return res.status(error.status).json({ error: error.message });
  }
  if (error instanceof ExecutionError) {
    return res.status(error.status).json({ error: error.message, code: error.code });
  }
  return res.status(500).json({ error: error instanceof Error ? error.message : "Unknown Jira integration error" });
};

const handleMeetingProviderError = (res: Response, error: unknown) => {
  if (error instanceof MeetingProviderIntegrationError) {
    return res.status(error.status).json({ error: error.message });
  }
  return res
    .status(500)
    .json({ error: error instanceof Error ? error.message : "Unknown meeting provider integration error" });
};

const getProvider = (provider: string) => meetingProviders.get(provider as MeetingProvider);

export const getJiraStatusHandler = async (_req: Request, res: Response) => {
  try {
    return res.status(200).json(await jiraIntegration.getStatus());
  } catch (error) {
    return handleJiraError(res, error);
  }
};

export const disconnectJiraHandler = async (_req: Request, res: Response) => {
  try {
    return res.status(200).json(await jiraIntegration.disconnect());
  } catch (error) {
    return handleJiraError(res, error);
  }
};

export const getJiraAuthUrlHandler = (_req: Request, res: Response) => {
  try {
    return res.status(200).json({ url: jiraIntegration.getAuthorizationUrl() });
  } catch (error) {
    return handleJiraError(res, error);
  }
};

export const jiraCallbackHandler = async (req: Request, res: Response) => {
  const code = typeof req.query.code === "string" ? req.query.code : undefined;
  if (!code) {
    return res.status(400).send("Missing Jira OAuth code.");
  }

  try {
    await jiraIntegration.handleCallback(code);
    return res
      .status(200)
      .type("html")
      .send(`<!doctype html>
<html>
  <body style="font-family:sans-serif;background:#0b1024;color:#fff;padding:24px">
    Jira connected. You can return to OrbitPlan.
    <script>
      if (window.opener) {
        window.opener.postMessage({ type: "orbitplan:jira-connected" }, "*");
      }
      setTimeout(function () { window.close(); }, 1200);
    </script>
  </body>
</html>`);
  } catch (error) {
    return handleJiraError(res, error);
  }
};

export const listJiraSitesHandler = async (_req: Request, res: Response) => {
  try {
    return res.status(200).json({ sites: await jiraIntegration.listSites() });
  } catch (error) {
    return handleJiraError(res, error);
  }
};

export const listJiraProjectsHandler = async (req: Request, res: Response) => {
  const cloudId = typeof req.query.cloudId === "string" ? req.query.cloudId : undefined;
  if (!cloudId) {
    return res.status(400).json({ error: "cloudId is required" });
  }

  try {
    return res.status(200).json({ projects: await jiraIntegration.listProjects(cloudId) });
  } catch (error) {
    return handleJiraError(res, error);
  }
};

export const getJiraCreateMetaHandler = async (req: Request, res: Response) => {
  const cloudId = typeof req.query.cloudId === "string" ? req.query.cloudId : undefined;
  const projectKey = typeof req.query.projectKey === "string" ? req.query.projectKey : undefined;
  if (!cloudId || !projectKey) {
    return res.status(400).json({ error: "cloudId and projectKey are required" });
  }

  try {
    return res.status(200).json({ issueTypes: await jiraIntegration.getCreateMeta(cloudId, projectKey) });
  } catch (error) {
    return handleJiraError(res, error);
  }
};

export const getJiraLookupHandler = async (req: Request, res: Response) => {
  const cloudId = typeof req.query.cloudId === "string" ? req.query.cloudId : undefined;
  const projectKey = typeof req.query.projectKey === "string" ? req.query.projectKey : undefined;
  const query = typeof req.query.query === "string" ? req.query.query : undefined;
  const kind = typeof req.query.kind === "string" ? req.query.kind : undefined;
  if (!cloudId || !projectKey || !query || !kind) {
    return res.status(400).json({ error: "cloudId, projectKey, query, and kind are required" });
  }

  try {
    switch (kind) {
      case "user":
        return res.status(200).json({ items: await jiraIntegration.lookupUsers(cloudId, projectKey, query) });
      case "issue":
        return res.status(200).json({ items: await jiraIntegration.lookupIssues(cloudId, projectKey, query) });
      case "epic":
        return res.status(200).json({ items: await jiraIntegration.lookupEpics(cloudId, projectKey, query) });
      case "sprint":
        return res.status(200).json({ items: await jiraIntegration.lookupSprints(cloudId, projectKey, query) });
      default:
        return res.status(400).json({ error: "Unsupported lookup kind" });
    }
  } catch (error) {
    return handleJiraError(res, error);
  }
};

export const exportMeetingToJiraHandler = async (req: Request, res: Response) => {
  const parsed = JiraExportSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid request", details: parsed.error.flatten() });
  }

  try {
    const result = await executionService.export({
      meetingId: parsed.data.meetingId,
      profile: parsed.data.ticketFormatPreset ?? "enterprise",
      target: {
        destination: "jira",
        cloudId: parsed.data.cloudId,
        projectKey: parsed.data.projectKey,
        ticketDetails: parsed.data.ticketDetails,
      },
    });
    return res.status(200).json(result.result);
  } catch (error) {
    return handleJiraError(res, error);
  }
};

export const scanMeetingToJiraHandler = async (req: Request, res: Response) => {
  const parsed = JiraScanSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid request", details: parsed.error.flatten() });
  }

  try {
    const result = await executionService.scan({
      meetingId: parsed.data.meetingId,
      profile: parsed.data.ticketFormatPreset ?? "enterprise",
      target: {
        destination: "jira",
        cloudId: parsed.data.cloudId,
        projectKey: parsed.data.projectKey,
        ticketDetails: parsed.data.ticketDetails,
      },
    });
    return res.status(200).json(result.raw ?? result);
  } catch (error) {
    return handleJiraError(res, error);
  }
};

export const exportMeetingToEmailHandler = async (req: Request, res: Response) => {
  const parsed = EmailExportSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid request", details: parsed.error.flatten() });
  }

  try {
    const result = await executionService.export({
      meetingId: parsed.data.meetingId,
      profile: parsed.data.ticketFormatPreset ?? "enterprise",
      target: {
        destination: "email",
        recipientMode: parsed.data.recipientMode,
        recipients: parsed.data.recipients,
        subject: parsed.data.subject,
      },
    });
    return res.status(200).json(result.result);
  } catch (error) {
    return handleJiraError(res, error);
  }
};

export const getMeetingProviderStatusHandler = async (req: Request, res: Response) => {
  try {
    const provider = getProvider(req.params.provider);
    return res.status(200).json(await provider.getStatus(req.authSession!.user.id));
  } catch (error) {
    return handleMeetingProviderError(res, error);
  }
};

export const getMeetingProviderAuthUrlHandler = async (req: Request, res: Response) => {
  try {
    const provider = getProvider(req.params.provider);
    return res.status(200).json({ url: provider.getAuthorizationUrl(req.authSession!.user.id) });
  } catch (error) {
    return handleMeetingProviderError(res, error);
  }
};

export const listMeetingProviderInboxHandler = async (req: Request, res: Response) => {
  try {
    return res.status(200).json({
      items: await listImportedMeetingsByProvider(req.params.provider as MeetingProvider),
    });
  } catch (error) {
    return handleMeetingProviderError(res, error);
  }
};

export const syncMeetingProviderInboxHandler = async (req: Request, res: Response) => {
  try {
    const provider = getProvider(req.params.provider);
    return res.status(200).json(await provider.syncInbox(req.authSession!.user.id));
  } catch (error) {
    return handleMeetingProviderError(res, error);
  }
};

export const disconnectMeetingProviderHandler = async (req: Request, res: Response) => {
  try {
    const provider = getProvider(req.params.provider);
    return res.status(200).json(await provider.disconnect(req.authSession!.user.id));
  } catch (error) {
    return handleMeetingProviderError(res, error);
  }
};

export const meetingProviderCallbackHandler = async (req: Request, res: Response) => {
  const code = typeof req.query.code === "string" ? req.query.code : undefined;
  const state = typeof req.query.state === "string" ? req.query.state : undefined;
  if (!code) {
    return res.status(400).send("Missing OAuth code.");
  }

  try {
    const provider = getProvider(req.params.provider);
    await provider.handleCallback(code, state);
    return res
      .status(200)
      .type("html")
      .send(`<!doctype html>
<html>
  <body style="font-family:sans-serif;background:#0b1024;color:#fff;padding:24px">
    Meeting provider connected. You can return to OrbitPlan.
    <script>
      if (window.opener) {
        window.opener.postMessage({ type: "orbitplan:meeting-provider-connected", provider: "${req.params.provider}" }, "*");
      }
      setTimeout(function () { window.close(); }, 1200);
    </script>
  </body>
</html>`);
  } catch (error) {
    return handleMeetingProviderError(res, error);
  }
};

export const importMeetingFromProviderHandler = async (req: Request, res: Response) => {
  const parsed = MeetingImportSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid request", details: parsed.error.flatten() });
  }

  try {
    const provider = getProvider(req.params.provider);
    const result = await provider.importMeeting(req.authSession!.user.id, {
      provider: req.params.provider as MeetingProvider,
      ...parsed.data,
    });
    return res.status(200).json(result);
  } catch (error) {
    return handleMeetingProviderError(res, error);
  }
};

export const meetingProviderWebhookHandler = async (req: Request, res: Response) => {
  if (req.params.provider === "teams") {
    const validationToken =
      (typeof req.query.validationToken === "string" ? req.query.validationToken : undefined) ??
      (Array.isArray(req.headers.validationtoken) ? req.headers.validationtoken[0] : req.headers.validationtoken);
    if (validationToken) {
      return res.status(200).type("text/plain").send(validationToken);
    }
  }

  try {
    const provider = getProvider(req.params.provider);
    const result = await provider.handleWebhook(req.body, req.headers);
    return res.status(202).json(result);
  } catch (error) {
    return handleMeetingProviderError(res, error);
  }
};
