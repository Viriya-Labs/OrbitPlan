import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import {
  disconnectJiraHandler,
  exportMeetingToEmailHandler,
  exportMeetingToJiraHandler,
  getJiraAuthUrlHandler,
  getJiraCreateMetaHandler,
  getJiraLookupHandler,
  getJiraStatusHandler,
  jiraCallbackHandler,
  listJiraProjectsHandler,
  listJiraSitesHandler,
  scanMeetingToJiraHandler,
} from "../controllers/integrations.js";

const router = Router();

router.get("/integrations/jira/callback", jiraCallbackHandler);
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

export default router;
