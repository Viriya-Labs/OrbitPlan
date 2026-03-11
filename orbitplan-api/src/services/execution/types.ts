import type { ActionItem } from "../../types/action.js";
import type { EmailLog } from "../../types/emailLog.js";
import type { TicketFormatPreset, JiraExportResult, JiraScanResult, JiraTicketDetails } from "../../types/jira.js";
import type { Meeting } from "../../types/meeting.js";
import type { MeetingSummary } from "../../types/summary.js";
import type { MeetingTranscript } from "../../types/transcript.js";

export type ExecutionDestination = "jira" | "email";
export type ExecutionProfileId = TicketFormatPreset;

export type CanonicalExecutionPayload = {
  meeting: Meeting;
  summary: MeetingSummary | null;
  transcript: MeetingTranscript | null;
  actions: ActionItem[];
  profile: ExecutionProfileId;
  metadata: Record<string, unknown>;
};

export type JiraExecutionTarget = {
  destination: "jira";
  cloudId: string;
  projectKey: string;
  ticketDetails?: JiraTicketDetails;
};

export type EmailRecipientMode = "attendees" | "owners" | "custom";

export type EmailExecutionTarget = {
  destination: "email";
  recipientMode: EmailRecipientMode;
  recipients?: string[];
  subject?: string;
};

export type ExecutionTarget = JiraExecutionTarget | EmailExecutionTarget;

export type DestinationValidationIssue = {
  code: string;
  message: string;
  actionId?: string;
  severity: "warning" | "error";
};

export type DestinationValidationResult = {
  ok: boolean;
  issues: DestinationValidationIssue[];
  raw?: JiraScanResult | unknown;
};

export type ExecutionRunRequest = {
  meetingId: string;
  profile: ExecutionProfileId;
  target: ExecutionTarget;
};

export type ExecutionRunResult = {
  destination: ExecutionDestination;
  profile: ExecutionProfileId;
  result: JiraExportResult | EmailExecutionResult | unknown;
};

export type EmailExecutionResult = {
  createdCount: number;
  logs: EmailLog[];
};
