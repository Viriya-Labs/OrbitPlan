export type MeetingProvider = "zoom" | "teams";
export type MeetingStatus = "created" | "processing" | "ready" | "approved" | "error";

export type MeetingProviderIntegrationStatus = {
  provider: MeetingProvider;
  configured: boolean;
  connected: boolean;
  externalEmail?: string;
};

export type MeetingProviderInboxItem = {
  id: string;
  provider: MeetingProvider;
  title: string;
  status: MeetingStatus;
  createdAt: string;
  scheduledAt?: string;
  organizerEmail?: string;
  externalUrl?: string;
  attendeeCount: number;
  hasRecordingFile: boolean;
  hasTranscript: boolean;
  processingError?: string;
};

export type MeetingProviderSyncResult = {
  imported: number;
  skipped: number;
  total: number;
};
