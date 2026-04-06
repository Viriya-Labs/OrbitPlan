import type { Request, Response } from "express";
import { z } from "zod";
import { MeetingCreateSchema } from "../dto/meetings.js";
import type { ActionItem } from "../types/action.js";
import { SUPPORTED_MEETING_MIME_TYPES } from "../constants/meetingMedia.js";
import {
  addMeetingFile,
  appendMeetingChatMessages,
  approveMeeting,
  clearMeetingChatHistory,
  confirmMeetingActions,
  createMeeting,
  deleteMeetingAction,
  getMeetingChatHistory,
  getMeetingById,
  getLatestMeetingFile,
  processMeeting,
  setMeetingProcessingStage,
  tryBeginAsyncMeetingProcess,
  updateMeetingAction,
} from "../storage/meetingsStore.js";
import { createAnalysisProvider } from "../services/analysis/index.js";
import { createMeetingChatProvider } from "../services/chat/index.js";
import { JiraIntegrationError, jiraIntegration } from "../services/integrations/jira.js";
import { createTranscriptionProvider } from "../services/transcription/index.js";
import { env } from "../config/env.js";
import { logger } from "../lib/logger.js";
import { runMeetingProcessJob } from "../jobs/meetingProcessJob.js";

class TimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TimeoutError";
  }
}

type ProcessingErrorCode = "invalid_format" | "timeout" | "quota" | "provider_error";

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

const MeetingChatSchema = z.object({
  question: z.string().min(1),
});

const MeetingChatHistoryQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
  before: z.string().datetime().optional(),
});

const ActionUpdateSchema = z.object({
  status: z.enum(["open", "in_progress", "done"]).optional(),
  priority: z.enum(["low", "medium", "high"]).optional(),
}).refine((value) => value.status || value.priority, {
  message: "At least one field is required",
});

const ActionConfirmationSchema = z.object({
  confirmed: z.boolean(),
});

const classifyProcessingError = (error: unknown): { status: number; code: ProcessingErrorCode; details: string } => {
  const message = error instanceof Error ? error.message : "Unknown error";
  const normalized = message.toLowerCase();
  const maybeStatus = typeof error === "object" && error !== null && "status" in error ? (error as { status?: number }).status : undefined;

  if (error instanceof TimeoutError || normalized.includes("timed out") || normalized.includes("timeout")) {
    return {
      status: 504,
      code: "timeout",
      details: `Processing timed out. Try again with a shorter meeting file or increase AI_TIMEOUT_MS. (${message})`,
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
      details: "AI provider quota/rate limit reached. Check billing or wait and retry.",
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
      details: "Invalid or unsupported media format. Use MP3, WAV, M4A, MP4, or WEBM.",
    };
  }

  return {
    status: 502,
    code: "provider_error",
    details: `AI provider request failed. ${message}`,
  };
};

export const createMeetingHandler = async (req: Request, res: Response) => {
  const parsed = MeetingCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: "Invalid request",
      details: parsed.error.flatten(),
    });
  }

  const meeting = await createMeeting(parsed.data);
  return res.status(201).json(meeting);
};

export const getMeetingHandler = async (req: Request, res: Response) => {
  try {
    await jiraIntegration.syncMeetingActions(req.params.id);
  } catch (error) {
    if (!(error instanceof JiraIntegrationError) || error.status === 404) {
      // Fall back to local state when Jira sync is unavailable.
    }
  }

  const data = await getMeetingById(req.params.id);
  if (!data) {
    return res.status(404).json({ error: "Meeting not found" });
  }
  return res.status(200).json(data);
};

export const uploadMeetingFileHandler = async (req: Request, res: Response) => {
  if (!req.file) {
    return res.status(400).json({ error: "File is required" });
  }

  const stored = await addMeetingFile(req.params.id, {
    originalName: req.file.originalname,
    mimeType: req.file.mimetype,
    size: req.file.size,
    path: req.file.path,
  });

  if (!stored) {
    return res.status(404).json({ error: "Meeting not found" });
  }

  return res.status(201).json({ meetingId: req.params.id, file: stored });
};

export const processMeetingHandler = async (req: Request, res: Response) => {
  const meeting = await getMeetingById(req.params.id);
  if (!meeting) {
    return res.status(404).json({ error: "Meeting not found" });
  }

  const latestFile = await getLatestMeetingFile(req.params.id);
  if (!latestFile) {
    return res.status(400).json({ error: "No uploaded file found for this meeting" });
  }

  if (!SUPPORTED_MEETING_MIME_TYPES.has(latestFile.mimeType)) {
    return res.status(400).json({
      code: "invalid_format",
      error: "Unsupported file format",
      details: `Supported formats: mp3, wav, m4a, mp4, webm. Received: ${latestFile.mimeType}`,
    });
  }

  const meetingId = req.params.id;
  const wait =
    req.query.wait === "true" ||
    req.query.wait === "1" ||
    String(req.query.wait).toLowerCase() === "yes";

  if (!wait) {
    const acquired = await tryBeginAsyncMeetingProcess(meetingId);
    if (!acquired) {
      return res.status(202).json({
        accepted: false,
        status: "processing",
        meetingId,
        message: "This meeting is already being processed. Poll GET /api/meetings/:id until status is ready or error.",
        pollUrl: `/api/meetings/${meetingId}`,
      });
    }

    setImmediate(() => {
      void runMeetingProcessJob(meetingId).catch((err) => {
        logger.error("meeting.process.async.unhandled", {
          meetingId,
          message: err instanceof Error ? err.message : String(err),
        });
      });
    });

    return res.status(202).json({
      accepted: true,
      status: "processing",
      meetingId,
      message: "Processing started. Poll GET /api/meetings/:id until status is ready or error. Optional webhook: set PROCESS_WEBHOOK_URL.",
      pollUrl: `/api/meetings/${meetingId}`,
    });
  }

  const t0 = performance.now();

  try {
    logger.info("meeting.process.start", {
      meetingId,
      mimeType: latestFile.mimeType,
      transcriptionProvider: env.transcriptionProvider,
      analysisProvider: env.analysisProvider,
    });

    await setMeetingProcessingStage(meetingId, "preparing_media");
    const provider = createTranscriptionProvider();
    const tTranscribe = performance.now();
    await setMeetingProcessingStage(meetingId, "transcribing");
    const transcript = await withTimeout(
      provider.transcribe({
        filePath: latestFile.path,
        mimeType: latestFile.mimeType,
      }),
      env.aiTimeoutMs,
      `Transcription timed out after ${Math.round(env.aiTimeoutMs / 1000)} seconds`,
    );
    logger.info("meeting.process.transcription_done", {
      meetingId,
      durationMs: Math.round(performance.now() - tTranscribe),
      transcriptChars: transcript.text.length,
    });

    const analysisProvider = createAnalysisProvider();
    const tAnalyze = performance.now();
    await setMeetingProcessingStage(meetingId, "analyzing");
    const analysis = await withTimeout(
      analysisProvider.analyze({
        meetingTitle: meeting.meeting.title,
        attendees: meeting.meeting.attendees,
        transcript: transcript.text,
      }),
      env.aiTimeoutMs,
      `Analysis timed out after ${Math.round(env.aiTimeoutMs / 1000)} seconds`,
    );
    logger.info("meeting.process.analysis_done", {
      meetingId,
      durationMs: Math.round(performance.now() - tAnalyze),
      actionCount: analysis.actions.length,
    });

    const tPersist = performance.now();
    await setMeetingProcessingStage(meetingId, "saving");
    const processed = await processMeeting(req.params.id, transcript.text, analysis);
    if (!processed) {
      return res.status(404).json({ error: "Meeting not found" });
    }
    logger.info("meeting.process.complete", {
      meetingId,
      persistMs: Math.round(performance.now() - tPersist),
      totalMs: Math.round(performance.now() - t0),
    });

    return res.status(200).json(processed);
  } catch (error) {
    const classified = classifyProcessingError(error);
    logger.error("meeting.process.failed", {
      meetingId,
      code: classified.code,
      status: classified.status,
      message: error instanceof Error ? error.message : String(error),
      totalMs: Math.round(performance.now() - t0),
    });
    const status = classified.status;
    return res.status(status).json({
      error: "AI processing failed",
      code: classified.code,
      details: classified.details,
    });
  }
};

export const approveMeetingHandler = async (req: Request, res: Response) => {
  const approved = await approveMeeting(req.params.id);
  if (!approved) {
    return res.status(404).json({ error: "Meeting not found" });
  }

  if ("error" in approved) {
    return res.status(409).json(approved);
  }

  return res.status(200).json(approved);
};

export const chatMeetingHandler = async (req: Request, res: Response) => {
  const parsed = MeetingChatSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid request", details: parsed.error.flatten() });
  }

  const data = await getMeetingById(req.params.id);
  if (!data) {
    return res.status(404).json({ error: "Meeting not found" });
  }

  if (!data.transcript?.text) {
    return res.status(400).json({ error: "Meeting has no transcript yet. Process the meeting first." });
  }

  try {
    const chatProvider = createMeetingChatProvider();
    const response = await withTimeout(
      chatProvider.ask({
        meetingTitle: data.meeting.title,
        attendees: data.meeting.attendees,
        transcript: data.transcript.text,
        summary: data.summary
          ? {
              decisions: data.summary.decisions,
              risks: data.summary.risks,
              notes: data.summary.notes,
            }
          : null,
        actions: data.actions.map((action: ActionItem) => ({
          description: action.description,
          ownerEmail: action.ownerEmail,
          dueDate: action.dueDate,
          status: action.status,
          priority: action.priority,
        })),
        question: parsed.data.question,
      }),
      env.aiTimeoutMs,
      `Meeting chat timed out after ${Math.round(env.aiTimeoutMs / 1000)} seconds`,
    );

    const persisted = await appendMeetingChatMessages(req.params.id, [
      { role: "user", text: parsed.data.question },
      { role: "assistant", text: response.answer, citations: response.citations },
    ]);

    return res.status(200).json({
      ...response,
      messages: persisted ?? [],
    });
  } catch (error) {
    const maybeStatus = typeof error === "object" && error !== null && "status" in error ? (error as { status?: number }).status : undefined;
    const status = maybeStatus && maybeStatus >= 400 && maybeStatus < 500 ? maybeStatus : 502;
    return res.status(status).json({
      error: "Meeting chat failed",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

export const listMeetingChatHistoryHandler = async (req: Request, res: Response) => {
  const parsed = MeetingChatHistoryQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid request", details: parsed.error.flatten() });
  }

  const history = await getMeetingChatHistory(req.params.id, parsed.data);
  if (!history) {
    return res.status(404).json({ error: "Meeting not found" });
  }

  return res.status(200).json(history);
};

export const clearMeetingChatHistoryHandler = async (req: Request, res: Response) => {
  const result = await clearMeetingChatHistory(req.params.id);
  if (!result) {
    return res.status(404).json({ error: "Meeting not found" });
  }

  return res.status(200).json(result);
};

export const updateMeetingActionHandler = async (req: Request, res: Response) => {
  const parsed = ActionUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid request", details: parsed.error.flatten() });
  }

  const updated = await updateMeetingAction(req.params.id, req.params.actionId, parsed.data);
  if (!updated) {
    return res.status(404).json({ error: "Meeting not found" });
  }
  if ("error" in updated) {
    return res.status(404).json({ error: updated.error });
  }

  const action = updated.actions.find((item) => item.id === req.params.actionId);
  if (action?.jiraIssueKey && action.jiraCloudId) {
    try {
      await jiraIntegration.syncActionToJira(action);
      await jiraIntegration.syncMeetingActions(req.params.id);
    } catch (error) {
      return res.status(502).json({
        error: "Jira sync failed",
        details: error instanceof Error ? error.message : "Unknown Jira sync error",
      });
    }
  }

  const refreshed = await getMeetingById(req.params.id);
  return res.status(200).json(refreshed ?? updated);
};

export const resyncMeetingActionHandler = async (req: Request, res: Response) => {
  const meeting = await getMeetingById(req.params.id);
  if (!meeting) {
    return res.status(404).json({ error: "Meeting not found" });
  }

  const action = meeting.actions.find((item) => item.id === req.params.actionId);
  if (!action) {
    return res.status(404).json({ error: "Action not found" });
  }
  if (!action.jiraIssueKey || !action.jiraCloudId) {
    return res.status(409).json({ error: "Action is not linked to Jira" });
  }

  try {
    await jiraIntegration.syncActionToJira(action);
    await jiraIntegration.syncMeetingActions(req.params.id);
  } catch (error) {
    return res.status(502).json({
      error: "Jira resync failed",
      details: error instanceof Error ? error.message : "Unknown Jira resync error",
    });
  }

  const refreshed = await getMeetingById(req.params.id);
  return res.status(200).json(refreshed ?? meeting);
};

export const deleteMeetingActionHandler = async (req: Request, res: Response) => {
  const updated = await deleteMeetingAction(req.params.id, req.params.actionId);
  if (!updated) {
    return res.status(404).json({ error: "Meeting not found" });
  }
  if ("error" in updated) {
    return res.status(404).json({ error: updated.error });
  }

  return res.status(200).json(updated);
};

export const confirmMeetingActionsHandler = async (req: Request, res: Response) => {
  const parsed = ActionConfirmationSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid request", details: parsed.error.flatten() });
  }

  const updated = await confirmMeetingActions(req.params.id, parsed.data.confirmed);
  if (!updated) {
    return res.status(404).json({ error: "Meeting not found" });
  }

  return res.status(200).json(updated);
};
