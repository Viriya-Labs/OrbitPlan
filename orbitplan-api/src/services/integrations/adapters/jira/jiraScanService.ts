import { JiraIntegrationError, jiraIntegration } from "../../jira.js";
import type { CanonicalExecutionPayload, DestinationValidationResult, JiraExecutionTarget } from "../../../execution/types.js";
import { jiraExecution } from "./jiraExecution.js";
import { jiraMapper } from "./jiraMapper.js";

export const jiraScanService = {
  async scan(payload: CanonicalExecutionPayload, target: JiraExecutionTarget): Promise<DestinationValidationResult> {
    const input = jiraMapper.toExecutionInput(payload, target);
    if (!payload.meeting.actionsConfirmed) {
      throw new JiraIntegrationError("Confirm the action plan before scanning for Jira export.", 409);
    }

    const issueTypes = await jiraIntegration.getCreateMeta(input.cloudId, input.projectKey);
    const result = jiraExecution.buildScanResult({
      payload,
      projectKey: input.projectKey,
      ticketDetails: input.ticketDetails ?? {},
      issueTypes,
    });

    return {
      ok: result.blockedCount === 0,
      issues: result.items.flatMap((item) =>
        item.reasons.map((reason) => ({
          code: item.status === "blocked" ? "jira_scan_blocked" : "jira_scan_warning",
          message: reason,
          actionId: item.actionId,
          severity: item.status === "blocked" ? ("error" as const) : ("warning" as const),
        })),
      ),
      raw: result,
    };
  },
};
