import type { MeetingProvider } from "./meeting.js";

export type MeetingProviderOAuthToken = {
  accessToken: string;
  refreshToken?: string;
  expiresAt: string;
  scope?: string;
  externalUserId?: string;
  externalEmail?: string;
  metadata?: Record<string, unknown>;
};

export type MeetingProviderConnectionStatus = {
  provider: MeetingProvider;
  configured: boolean;
  connected: boolean;
  externalEmail?: string;
};

export type ImportedMeetingInput = {
  provider: MeetingProvider;
  title: string;
  scheduledAt?: string;
  attendees?: string[];
  organizerEmail?: string;
  externalMeetingId: string;
  externalRecordId?: string;
  externalUrl?: string;
  transcriptText?: string;
  recordingUrl?: string;
  mimeType?: string;
  fileName?: string;
};
