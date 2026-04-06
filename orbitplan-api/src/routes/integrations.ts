import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import {
  disconnectJiraHandler,
  disconnectMeetingProviderHandler,
  exportMeetingToEmailHandler,
  exportMeetingToJiraHandler,
  getMeetingProviderAuthUrlHandler,
  getMeetingProviderStatusHandler,
  getJiraAuthUrlHandler,
  getJiraCreateMetaHandler,
  getJiraLookupHandler,
  getJiraStatusHandler,
  importMeetingFromProviderHandler,
  jiraCallbackHandler,
  listJiraProjectsHandler,
  listJiraSitesHandler,
  listMeetingProviderInboxHandler,
  syncMeetingProviderInboxHandler,
  meetingProviderCallbackHandler,
  meetingProviderWebhookHandler,
  scanMeetingToJiraHandler,
} from "../controllers/integrations.js";

const router = Router();
const withProvider =
  (provider: "zoom" | "teams") =>
  (req: Parameters<typeof meetingProviderCallbackHandler>[0], _res: Parameters<typeof meetingProviderCallbackHandler>[1], next: () => void) => {
    req.params.provider = provider;
    next();
  };

router.get("/integrations/jira/callback", jiraCallbackHandler);
router.get("/integrations/zoom/callback", withProvider("zoom"), meetingProviderCallbackHandler);
router.get("/integrations/teams/callback", withProvider("teams"), meetingProviderCallbackHandler);
router.post("/integrations/zoom/webhook", withProvider("zoom"), meetingProviderWebhookHandler);
router.post("/integrations/teams/webhook", withProvider("teams"), meetingProviderWebhookHandler);
router.use(requireAuth);
router.get("/integrations/jira/status", getJiraStatusHandler);
router.get("/integrations/jira/auth-url", getJiraAuthUrlHandler);
router.post("/integrations/jira/disconnect", disconnectJiraHandler);
router.get("/integrations/jira/sites", listJiraSitesHandler);
router.get("/integrations/jira/projects", listJiraProjectsHandler);
router.get("/integrations/jira/create-meta", getJiraCreateMetaHandler);
router.get("/integrations/jira/lookup", getJiraLookupHandler);
router.post("/integrations/jira/scan", scanMeetingToJiraHandler);
router.post("/integrations/jira/export", exportMeetingToJiraHandler);
router.post("/integrations/email/export", exportMeetingToEmailHandler);
router.get("/integrations/zoom/status", withProvider("zoom"), getMeetingProviderStatusHandler);
router.get("/integrations/teams/status", withProvider("teams"), getMeetingProviderStatusHandler);
router.get("/integrations/zoom/auth-url", withProvider("zoom"), getMeetingProviderAuthUrlHandler);
router.get("/integrations/teams/auth-url", withProvider("teams"), getMeetingProviderAuthUrlHandler);
router.get("/integrations/zoom/meetings", withProvider("zoom"), listMeetingProviderInboxHandler);
router.get("/integrations/teams/meetings", withProvider("teams"), listMeetingProviderInboxHandler);
router.post("/integrations/zoom/sync", withProvider("zoom"), syncMeetingProviderInboxHandler);
router.post("/integrations/teams/sync", withProvider("teams"), syncMeetingProviderInboxHandler);
router.post("/integrations/zoom/disconnect", withProvider("zoom"), disconnectMeetingProviderHandler);
router.post("/integrations/teams/disconnect", withProvider("teams"), disconnectMeetingProviderHandler);
router.post("/integrations/zoom/import", withProvider("zoom"), importMeetingFromProviderHandler);
router.post("/integrations/teams/import", withProvider("teams"), importMeetingFromProviderHandler);

export default router;
