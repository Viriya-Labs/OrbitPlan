import type { CanonicalExecutionPayload, EmailExecutionTarget, EmailRecipientMode } from "../../../execution/types.js";

export type EmailMappedExecutionInput = {
  meetingId: string;
  recipientMode: EmailRecipientMode;
  recipients: string[];
  subject: string;
};

const resolveRecipients = (payload: CanonicalExecutionPayload, target: EmailExecutionTarget): string[] => {
  switch (target.recipientMode) {
    case "owners":
      return Array.from(new Set(payload.actions.map((action) => action.ownerEmail).filter(Boolean)));
    case "custom":
      return Array.from(new Set((target.recipients ?? []).map((item) => item.trim()).filter(Boolean)));
    case "attendees":
    default:
      return Array.from(new Set(payload.meeting.attendees.map((item) => item.trim()).filter(Boolean)));
  }
};

const buildDefaultSubject = (payload: CanonicalExecutionPayload) => {
  switch (payload.profile) {
    case "engineering":
      return `OrbitPlan Engineering Plan: ${payload.meeting.title}`;
    case "operations":
      return `OrbitPlan Operations Handoff: ${payload.meeting.title}`;
    case "compliance":
      return `OrbitPlan Compliance Review: ${payload.meeting.title}`;
    case "enterprise":
    default:
      return `OrbitPlan Action Plan: ${payload.meeting.title}`;
  }
};

export const emailMapper = {
  toExecutionInput(payload: CanonicalExecutionPayload, target: EmailExecutionTarget): EmailMappedExecutionInput {
    return {
      meetingId: payload.meeting.id,
      recipientMode: target.recipientMode,
      recipients: resolveRecipients(payload, target),
      subject: target.subject?.trim() || buildDefaultSubject(payload),
    };
  },
};
