export type ExecutionDestination = "jira" | "email";
export type EmailRecipientMode = "attendees" | "owners" | "custom";

export type EmailExportResult = {
  createdCount: number;
  logs: Array<{
    id: string;
    meetingId: string;
    recipient: string;
    type: "summary" | "action";
    payload: Record<string, string>;
    sentAt: string;
  }>;
};
