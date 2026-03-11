import { ExecutionError } from "../../../execution/errors.js";
import type { CanonicalExecutionPayload, DestinationValidationResult, EmailExecutionTarget } from "../../../execution/types.js";
import { emailMapper } from "./emailMapper.js";

export const emailScanService = {
  async scan(payload: CanonicalExecutionPayload, target: EmailExecutionTarget): Promise<DestinationValidationResult> {
    const input = emailMapper.toExecutionInput(payload, target);
    const issues: DestinationValidationResult["issues"] = [];

    if (!payload.meeting.actionsConfirmed) {
      issues.push({
        code: "email_requires_confirmed_actions",
        message: "Confirm the action plan before exporting by email.",
        severity: "error",
      });
    }

    if (input.recipients.length === 0) {
      issues.push({
        code: "email_missing_recipients",
        message: "No recipients are available for this email export target.",
        severity: "error",
      });
    }

    if (!input.subject.trim()) {
      throw new ExecutionError("Email export requires a subject.", {
        code: "email_missing_subject",
        status: 400,
      });
    }

    if (payload.actions.length === 0) {
      issues.push({
        code: "email_missing_actions",
        message: "No actions are available to include in the email export.",
        severity: "error",
      });
    }

    return {
      ok: issues.every((issue) => issue.severity !== "error"),
      issues,
      raw: {
        recipients: input.recipients,
        subject: input.subject,
      },
    };
  },
};
