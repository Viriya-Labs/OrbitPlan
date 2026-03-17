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
  meetingProviderCallbackHandler,
  meetingProviderWebhookHandler,
  scanMeetingToJiraHandler,
} from "../controllers/integrations.js";

const router = Router();

router.get("/integrations/jira/callback", jiraCallbackHandler);
router.get("/integrations/:provider(zoom|teams)/callback", meetingProviderCallbackHandler);
router.post("/integrations/:provider(zoom|teams)/webhook", meetingProviderWebhookHandler);
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
router.get("/integrations/:provider(zoom|teams)/status", getMeetingProviderStatusHandler);
router.get("/integrations/:provider(zoom|teams)/auth-url", getMeetingProviderAuthUrlHandler);
router.post("/integrations/:provider(zoom|teams)/disconnect", disconnectMeetingProviderHandler);
router.post("/integrations/:provider(zoom|teams)/import", importMeetingFromProviderHandler);

export default router;
