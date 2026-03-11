import { linkActionToJiraIssue } from "../../../../storage/meetingsStore.js";
import type { JiraExportResult } from "../../../../types/jira.js";
import { JiraIntegrationError, jiraIntegration } from "../../jira.js";
import type { CanonicalExecutionPayload, JiraExecutionTarget } from "../../../execution/types.js";
import { jiraExecution } from "./jiraExecution.js";
import { jiraMapper } from "./jiraMapper.js";

export const jiraExportService = {
  async export(payload: CanonicalExecutionPayload, target: JiraExecutionTarget): Promise<JiraExportResult> {
    const input = jiraMapper.toExecutionInput(payload, target);
    if (!payload.meeting.actionsConfirmed) {
      throw new JiraIntegrationError("Confirm the action plan before exporting to Jira.", 409);
    }

    const sites = await jiraIntegration.listSites();
    const siteUrl = sites.find((site) => site.id === input.cloudId)?.url ?? "";
    const exportableActions = payload.actions.filter((action) => !action.jiraIssueKey || !action.jiraCloudId);

    if (exportableActions.length === 0) {
      throw new JiraIntegrationError("All actions from this meeting are already linked to Jira.", 409);
    }

    const issues: JiraExportResult["issues"] = [];

    for (const action of exportableActions) {
      const createWithPriority = async (withPriority: boolean) =>
        jiraIntegration.createIssue(
          input.cloudId,
          jiraExecution.buildIssueFields({
            payload,
            action,
            projectKey: input.projectKey,
            format: input.ticketFormatPreset,
            ticketDetails: input.ticketDetails ?? {},
            withPriority,
          }),
        );

      let created;
      try {
        created = await createWithPriority(true);
      } catch (error) {
        if (!(error instanceof JiraIntegrationError) || error.status < 400 || error.status >= 500) {
          throw error;
        }
        created = await createWithPriority(false);
      }

      const issueUrl = `${siteUrl}/browse/${created.key}`;
      issues.push({
        actionId: action.id,
        key: created.key,
        url: issueUrl,
      });

      await linkActionToJiraIssue(action.id, {
        jiraIssueKey: created.key,
        jiraIssueUrl: issueUrl,
        jiraCloudId: input.cloudId,
        jiraProjectKey: input.projectKey,
      });
    }

    return {
      createdCount: issues.length,
      issues,
    };
  },
};
