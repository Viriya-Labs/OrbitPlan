import { createMeetingEmailLogs } from "../../../../storage/meetingsStore.js";
import type { EmailExecutionResult, CanonicalExecutionPayload, EmailExecutionTarget } from "../../../execution/types.js";
import { ExecutionError } from "../../../execution/errors.js";
import { emailMapper } from "./emailMapper.js";

const buildBody = (payload: CanonicalExecutionPayload) => {
  const lines = [
    `Meeting: ${payload.meeting.title}`,
    `Profile: ${payload.profile}`,
    "",
    "Summary",
    payload.summary?.decisions || "No decisions captured.",
    "",
    "Risks",
    payload.summary?.risks || "No risks captured.",
    "",
    "Actions",
    ...payload.actions.map((action, index) => `${index + 1}. ${action.description} | Owner: ${action.ownerEmail} | Due: ${action.dueDate ?? "Not set"}`),
  ];

  return lines.join("\n");
};

export const emailExportService = {
  async export(payload: CanonicalExecutionPayload, target: EmailExecutionTarget): Promise<EmailExecutionResult> {
    const input = emailMapper.toExecutionInput(payload, target);
    if (!payload.meeting.actionsConfirmed) {
      throw new ExecutionError("Confirm the action plan before exporting by email.", {
        code: "email_requires_confirmed_actions",
        status: 409,
      });
    }
    if (payload.actions.length === 0) {
      throw new ExecutionError("No actions are available to export by email.", {
        code: "email_missing_actions",
        status: 409,
      });
    }
    if (input.recipients.length === 0) {
      throw new ExecutionError("No recipients are available for this email export target.", {
        code: "email_missing_recipients",
        status: 400,
      });
    }

    const logs = await createMeetingEmailLogs(
      payload.meeting.id,
      input.recipients.map((recipient) => ({
        recipient,
        type: "summary",
        payload: {
          subject: input.subject,
          body: buildBody(payload),
        },
      })),
    );

    return {
      createdCount: logs.length,
      logs,
    };
  },
};
