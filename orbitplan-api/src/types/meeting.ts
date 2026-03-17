export type MeetingSource = "upload" | "record";
export type MeetingProvider = "zoom" | "teams";
export type MeetingStatus = "created" | "processing" | "ready" | "approved" | "error";

export type Meeting = {
  id: string;
  title: string;
  scheduledAt?: string;
  attendees: string[];
  source: MeetingSource;
  provider?: MeetingProvider;
  externalMeetingId?: string;
  externalRecordId?: string;
  externalUrl?: string;
  organizerEmail?: string;
  status: MeetingStatus;
  actionsConfirmed: boolean;
  createdAt: string;
};
