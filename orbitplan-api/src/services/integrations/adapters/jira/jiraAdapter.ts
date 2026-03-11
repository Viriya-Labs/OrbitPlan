import type { JiraExportResult } from "../../../../types/jira.js";
import type { ExecutionAdapter } from "../types.js";
import type { CanonicalExecutionPayload, DestinationValidationResult, JiraExecutionTarget } from "../../../execution/types.js";
import { jiraExportService } from "./jiraExportService.js";
import { jiraScanService } from "./jiraScanService.js";

export const jiraAdapter: ExecutionAdapter<"jira", JiraExecutionTarget, JiraExportResult> = {
  destination: "jira",

  async scan(payload: CanonicalExecutionPayload, target: JiraExecutionTarget): Promise<DestinationValidationResult> {
    return jiraScanService.scan(payload, target);
  },

  async export(payload: CanonicalExecutionPayload, target: JiraExecutionTarget): Promise<JiraExportResult> {
    return jiraExportService.export(payload, target);
  },
};
