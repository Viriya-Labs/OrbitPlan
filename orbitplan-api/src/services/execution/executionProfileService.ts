import type { MeetingDetail } from "../../storage/meetingsStore.js";
import type { TicketFormatPreset } from "../../types/jira.js";
import type { CanonicalExecutionPayload, ExecutionProfileId } from "./types.js";

const normalizeProfile = (profile: string | undefined): ExecutionProfileId => {
  switch (profile) {
    case "engineering":
    case "operations":
    case "compliance":
    case "enterprise":
      return profile;
    default:
      return "enterprise";
  }
};

export const executionProfileService = {
  normalize(profile: string | undefined): ExecutionProfileId {
    return normalizeProfile(profile);
  },

  toTicketFormatPreset(profile: ExecutionProfileId): TicketFormatPreset {
    return normalizeProfile(profile);
  },

  buildCanonicalPayload(meetingDetail: MeetingDetail, profile: ExecutionProfileId): CanonicalExecutionPayload {
    const normalizedProfile = normalizeProfile(profile);

    return {
      meeting: meetingDetail.meeting,
      summary: meetingDetail.summary,
      transcript: meetingDetail.transcript,
      actions: meetingDetail.actions,
      profile: normalizedProfile,
      metadata: {
        source: "orbitplan",
        attendeeCount: meetingDetail.meeting.attendees.length,
        transcriptAvailable: Boolean(meetingDetail.transcript?.text),
        actionCount: meetingDetail.actions.length,
        summarySections: {
          decisions: Boolean(meetingDetail.summary?.decisions),
          risks: Boolean(meetingDetail.summary?.risks),
          notes: Boolean(meetingDetail.summary?.notes),
        },
      },
    };
  },
};
