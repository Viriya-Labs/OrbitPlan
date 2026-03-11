import type { JiraTicketDetails } from "../../../../types/jira.js";
import type { CanonicalExecutionPayload, JiraExecutionTarget } from "../../../execution/types.js";
import { executionProfileService } from "../../../execution/executionProfileService.js";

export type JiraMappedExecutionInput = {
  meetingId: string;
  cloudId: string;
  projectKey: string;
  ticketFormatPreset: ReturnType<typeof executionProfileService.toTicketFormatPreset>;
  ticketDetails?: JiraTicketDetails;
};

export const jiraMapper = {
  toExecutionInput(payload: CanonicalExecutionPayload, target: JiraExecutionTarget): JiraMappedExecutionInput {
    return {
      meetingId: payload.meeting.id,
      cloudId: target.cloudId,
      projectKey: target.projectKey,
      ticketFormatPreset: executionProfileService.toTicketFormatPreset(payload.profile),
      ticketDetails: target.ticketDetails,
    };
  },
};
