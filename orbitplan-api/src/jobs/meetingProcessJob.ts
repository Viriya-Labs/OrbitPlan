import { SUPPORTED_MEETING_MIME_TYPES } from "../constants/meetingMedia.js";
import { env } from "../config/env.js";
import { logger } from "../lib/logger.js";
import {
  getLatestMeetingFile,
  getMeetingById,
  markMeetingProcessFailed,
  processMeeting,
  setMeetingProcessingStage,
} from "../storage/meetingsStore.js";
import { createAnalysisProvider } from "../services/analysis/index.js";
import { createTranscriptionProvider } from "../services/transcription/index.js";
import { notifyMeetingProcessWebhook } from "../services/webhooks/processComplete.js";

class TimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TimeoutError";
  }
}

const withTimeout = async <T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> => {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new TimeoutError(message)), timeoutMs);
  });
  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
};

type Classified = { status: number; code: string; details: string };

const classifyProcessingError = (error: unknown): Classified => {
  const message = error instanceof Error ? error.message : "Unknown error";
  const normalized = message.toLowerCase();
  const maybeStatus = typeof error === "object" && error !== null && "status" in error ? (error as { status?: number }).status : undefined;

  if (error instanceof TimeoutError || normalized.includes("timed out") || normalized.includes("timeout")) {
    return {
      status: 504,
      code: "timeout",
      details: `Processing timed out after ${Math.round(env.aiTimeoutMs / 1000)}s. Retry or shorten the file.`,
    };
  }

  const isQuota =
    maybeStatus === 429 ||
    normalized.includes("insufficient_quota") ||
    normalized.includes("quota") ||
    normalized.includes("rate limit") ||
    normalized.includes("billing");
  if (isQuota) {
    return {
      status: 429,
      code: "quota",
      details: "AI provider quota/rate limit reached.",
    };
  }

  const isFormatIssue =
    maybeStatus === 400 &&
    (normalized.includes("format") ||
      normalized.includes("unsupported") ||
      normalized.includes("invalid file") ||
      normalized.includes("mime") ||
      normalized.includes("audio"));
  if (isFormatIssue) {
    return {
      status: 400,
      code: "invalid_format",
      details: "Invalid or unsupported media format.",
    };
  }

  return {
    status: 502,
    code: "provider_error",
    details: `AI provider request failed. ${message}`,
  };
};

/**
 * Runs transcription + analysis + DB persist. Used by async POST /process after 202.
 */
export const runMeetingProcessJob = async (meetingId: string): Promise<void> => {
  const t0 = performance.now();
  const snapshot = await getMeetingById(meetingId);
  const latestFile = await getLatestMeetingFile(meetingId);

  if (!snapshot || !latestFile) {
    await markMeetingProcessFailed(meetingId, "Meeting or uploaded file not found.");
    await notifyMeetingProcessWebhook({ meetingId, status: "error", error: "Meeting or file not found" });
    return;
  }

  if (!SUPPORTED_MEETING_MIME_TYPES.has(latestFile.mimeType)) {
    const msg = `Unsupported format: ${latestFile.mimeType}`;
    await markMeetingProcessFailed(meetingId, msg);
    await notifyMeetingProcessWebhook({ meetingId, status: "error", error: msg });
    return;
  }

  logger.info("meeting.process.async.start", {
    meetingId,
    mimeType: latestFile.mimeType,
    transcriptionProvider: env.transcriptionProvider,
    analysisProvider: env.analysisProvider,
  });

  try {
    await setMeetingProcessingStage(meetingId, "preparing_media");
    const provider = createTranscriptionProvider();
    const t1 = performance.now();
    await setMeetingProcessingStage(meetingId, "transcribing");
    const transcript = await withTimeout(
      provider.transcribe({
        filePath: latestFile.path,
        mimeType: latestFile.mimeType,
      }),
      env.aiTimeoutMs,
      `Transcription timed out after ${Math.round(env.aiTimeoutMs / 1000)} seconds`,
    );
    logger.info("meeting.process.async.transcription_done", {
      meetingId,
      durationMs: Math.round(performance.now() - t1),
      transcriptChars: transcript.text.length,
    });

    const analysisProvider = createAnalysisProvider();
    const t2 = performance.now();
    await setMeetingProcessingStage(meetingId, "analyzing");
    const analysis = await withTimeout(
      analysisProvider.analyze({
        meetingTitle: snapshot.meeting.title,
        attendees: snapshot.meeting.attendees,
        transcript: transcript.text,
      }),
      env.aiTimeoutMs,
      `Analysis timed out after ${Math.round(env.aiTimeoutMs / 1000)} seconds`,
    );
    logger.info("meeting.process.async.analysis_done", {
      meetingId,
      durationMs: Math.round(performance.now() - t2),
      actionCount: analysis.actions.length,
    });

    await setMeetingProcessingStage(meetingId, "saving");
    const processed = await processMeeting(meetingId, transcript.text, analysis);
    if (!processed) {
      await markMeetingProcessFailed(meetingId, "Meeting not found after processing.");
      await notifyMeetingProcessWebhook({ meetingId, status: "error", error: "Persist failed" });
      return;
    }

    logger.info("meeting.process.async.complete", {
      meetingId,
      totalMs: Math.round(performance.now() - t0),
    });
    await notifyMeetingProcessWebhook({ meetingId, status: "ready" });
  } catch (error) {
    const classified = classifyProcessingError(error);
    logger.error("meeting.process.async.failed", {
      meetingId,
      code: classified.code,
      message: error instanceof Error ? error.message : String(error),
      totalMs: Math.round(performance.now() - t0),
    });
    await markMeetingProcessFailed(meetingId, classified.details);
    await notifyMeetingProcessWebhook({
      meetingId,
      status: "error",
      error: classified.details,
    });
  }
};
