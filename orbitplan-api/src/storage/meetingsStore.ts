import crypto from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import type { Meeting } from "../types/meeting.js";
import type { MeetingFile } from "../types/file.js";
import type { ActionItem, ActionPriority, ActionStatus, JiraSyncStatus } from "../types/action.js";
import type { MeetingSummary } from "../types/summary.js";
import type { EmailLog } from "../types/emailLog.js";
import type { MeetingTranscript } from "../types/transcript.js";
import type { MeetingChatMessage } from "../types/chatMessage.js";
import type { MeetingCreateDTO } from "../dto/meetings.js";
import type { AnalysisResult } from "../services/analysis/types.js";

const meetingInclude = Prisma.validator<Prisma.MeetingInclude>()({
  files: true,
  transcript: true,
  summary: true,
  actions: {
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  },
  emailLogs: {
    orderBy: { sentAt: "asc" },
  },
  chatMessages: {
    orderBy: { createdAt: "asc" },
  },
});

type MeetingRecord = Prisma.MeetingGetPayload<{
  include: typeof meetingInclude;
}>;

const mapMeeting = (meeting: {
  id: string;
  title: string;
  scheduledAt: Date | null;
  attendees: string[];
  source: "upload" | "record";
  provider?: "zoom" | "teams" | null;
  externalMeetingId?: string | null;
  externalRecordId?: string | null;
  externalUrl?: string | null;
  organizerEmail?: string | null;
  status: "created" | "processing" | "ready" | "approved" | "error";
  actionsConfirmed: boolean;
  createdAt: Date;
}): Meeting => ({
  id: meeting.id,
  title: meeting.title,
  scheduledAt: meeting.scheduledAt?.toISOString(),
  attendees: meeting.attendees,
  source: meeting.source,
  provider: meeting.provider ?? undefined,
  externalMeetingId: meeting.externalMeetingId ?? undefined,
  externalRecordId: meeting.externalRecordId ?? undefined,
  externalUrl: meeting.externalUrl ?? undefined,
  organizerEmail: meeting.organizerEmail ?? undefined,
  status: meeting.status,
  actionsConfirmed: meeting.actionsConfirmed,
  createdAt: meeting.createdAt.toISOString(),
});

const mapFile = (file: {
  id: string;
  meetingId: string;
  originalName: string;
  mimeType: string;
  size: number;
  path: string;
  createdAt: Date;
}): MeetingFile => ({
  id: file.id,
  meetingId: file.meetingId,
  originalName: file.originalName,
  mimeType: file.mimeType,
  size: file.size,
  path: file.path,
  createdAt: file.createdAt.toISOString(),
});

const mapTranscript = (transcript: { id: string; meetingId: string; text: string; createdAt: Date } | null): MeetingTranscript | null =>
  transcript
    ? {
        id: transcript.id,
        meetingId: transcript.meetingId,
        text: transcript.text,
        createdAt: transcript.createdAt.toISOString(),
      }
    : null;

const mapSummary = (summary: { id: string; meetingId: string; decisions: string; risks: string; notes: string; createdAt: Date } | null): MeetingSummary | null =>
  summary
    ? {
        id: summary.id,
        meetingId: summary.meetingId,
        decisions: summary.decisions,
        risks: summary.risks,
        notes: summary.notes,
        createdAt: summary.createdAt.toISOString(),
      }
    : null;

const mapAction = (action: {
  id: string;
  meetingId: string;
  ownerEmail: string;
  dueDate: string | null;
  description: string;
  confidence: number;
  status: ActionStatus;
  priority: ActionPriority;
  jiraIssueKey: string | null;
  jiraIssueUrl: string | null;
  jiraCloudId: string | null;
  jiraProjectKey: string | null;
  jiraSyncStatus: JiraSyncStatus;
  jiraSyncError: string | null;
  createdAt: Date;
}): ActionItem => ({
  id: action.id,
  meetingId: action.meetingId,
  ownerEmail: action.ownerEmail,
  dueDate: action.dueDate ?? undefined,
  description: action.description,
  confidence: action.confidence,
  status: action.status,
  priority: action.priority,
  jiraIssueKey: action.jiraIssueKey ?? undefined,
  jiraIssueUrl: action.jiraIssueUrl ?? undefined,
  jiraCloudId: action.jiraCloudId ?? undefined,
  jiraProjectKey: action.jiraProjectKey ?? undefined,
  jiraSyncStatus: action.jiraSyncStatus,
  jiraSyncError: action.jiraSyncError ?? undefined,
  createdAt: action.createdAt.toISOString(),
});

const mapEmailLog = (log: {
  id: string;
  meetingId: string;
  recipient: string;
  type: "summary" | "action";
  payload: unknown;
  sentAt: Date;
}): EmailLog => ({
  id: log.id,
  meetingId: log.meetingId,
  recipient: log.recipient,
  type: log.type,
  payload: (typeof log.payload === "object" && log.payload ? log.payload : {}) as Record<string, string>,
  sentAt: log.sentAt.toISOString(),
});

const mapChatMessage = (message: {
  id: string;
  meetingId: string;
  role: "user" | "assistant";
  text: string;
  citations: string[];
  createdAt: Date;
}): MeetingChatMessage => ({
  id: message.id,
  meetingId: message.meetingId,
  role: message.role,
  text: message.text,
  citations: message.citations,
  createdAt: message.createdAt.toISOString(),
});

const mapMeetingDetail = (record: NonNullable<MeetingRecord>) => ({
  meeting: mapMeeting(record),
  files: record.files.map(mapFile),
  transcript: mapTranscript(record.transcript),
  summary: mapSummary(record.summary),
  actions: record.actions.map(mapAction),
  emailLogs: record.emailLogs.map(mapEmailLog),
  chatMessages: record.chatMessages.map(mapChatMessage),
});

export type MeetingDetail = ReturnType<typeof mapMeetingDetail>;

export const createMeeting = async (input: MeetingCreateDTO): Promise<Meeting> => {
  const meeting = await prisma.meeting.create({
    data: {
      id: crypto.randomUUID(),
      title: input.title,
      scheduledAt: input.scheduledAt ? new Date(input.scheduledAt) : null,
      attendees: input.attendees ?? [],
      source: input.source ?? "upload",
      status: "created",
      actionsConfirmed: true,
    },
  });

  return mapMeeting(meeting);
};

export const createImportedMeeting = async (input: {
  title: string;
  scheduledAt?: string;
  attendees?: string[];
  provider: "zoom" | "teams";
  externalMeetingId: string;
  externalRecordId?: string;
  externalUrl?: string;
  organizerEmail?: string;
}) => {
  const existing = await prisma.meeting.findFirst({
    where: {
      provider: input.provider,
      externalMeetingId: input.externalMeetingId,
    },
    include: meetingInclude,
  });
  if (existing) return mapMeetingDetail(existing);

  const created = await prisma.meeting.create({
    data: {
      id: crypto.randomUUID(),
      title: input.title,
      scheduledAt: input.scheduledAt ? new Date(input.scheduledAt) : null,
      attendees: input.attendees ?? [],
      source: "record",
      provider: input.provider,
      externalMeetingId: input.externalMeetingId,
      externalRecordId: input.externalRecordId ?? null,
      externalUrl: input.externalUrl ?? null,
      organizerEmail: input.organizerEmail ?? null,
      status: "created",
      actionsConfirmed: true,
    },
    include: meetingInclude,
  });

  return mapMeetingDetail(created);
};

export const getMeetingById = async (id: string) => {
  const record = await prisma.meeting.findUnique({
    where: { id },
    include: meetingInclude,
  });
  return record ? mapMeetingDetail(record) : null;
};

export const addMeetingFile = async (
  meetingId: string,
  file: Omit<MeetingFile, "id" | "meetingId" | "createdAt">,
) => {
  const meeting = await prisma.meeting.findUnique({ where: { id: meetingId }, select: { id: true } });
  if (!meeting) return null;

  const created = await prisma.meetingFile.create({
    data: {
      id: crypto.randomUUID(),
      meetingId,
      originalName: file.originalName,
      mimeType: file.mimeType,
      size: file.size,
      path: file.path,
    },
  });

  return mapFile(created);
};

export const getLatestMeetingFile = async (meetingId: string) => {
  const file = await prisma.meetingFile.findFirst({
    where: { meetingId },
    orderBy: { createdAt: "desc" },
  });
  return file ? mapFile(file) : null;
};

export const processMeeting = async (meetingId: string, transcriptText: string, analysis: AnalysisResult) => {
  const meeting = await prisma.meeting.findUnique({ where: { id: meetingId } });
  if (!meeting) return null;

  const fallbackOwner = meeting.attendees[0] ?? "unassigned@orbitplan.local";

  await prisma.$transaction(async (tx) => {
    await tx.meeting.update({
      where: { id: meetingId },
      data: {
        status: "processing",
      },
    });

    await tx.meetingTranscript.upsert({
      where: { meetingId },
      update: {
        text: transcriptText,
        createdAt: new Date(),
      },
      create: {
        id: crypto.randomUUID(),
        meetingId,
        text: transcriptText,
      },
    });

    await tx.meetingSummary.upsert({
      where: { meetingId },
      update: {
        decisions: analysis.decisions,
        risks: analysis.risks,
        notes: analysis.notes,
        createdAt: new Date(),
      },
      create: {
        id: crypto.randomUUID(),
        meetingId,
        decisions: analysis.decisions,
        risks: analysis.risks,
        notes: analysis.notes,
      },
    });

    await tx.actionItem.deleteMany({
      where: { meetingId },
    });

    const actionsToPersist = analysis.actions.length
      ? analysis.actions
      : [
          {
            description: "Review and confirm generated action items.",
            ownerEmail: fallbackOwner,
            confidence: 0.7,
          },
        ];

    if (actionsToPersist.length > 0) {
      await tx.actionItem.createMany({
        data: actionsToPersist.map((action) => ({
          id: crypto.randomUUID(),
          meetingId,
          ownerEmail: action.ownerEmail ?? fallbackOwner,
          dueDate: action.dueDate ?? null,
          description: action.description,
          confidence: action.confidence,
          status: "open",
          priority: "medium",
          jiraIssueKey: null,
          jiraIssueUrl: null,
          jiraCloudId: null,
          jiraProjectKey: null,
          jiraSyncStatus: "not_linked",
          jiraSyncError: null,
          createdAt: new Date(),
        })),
      });
    }

    await tx.meeting.update({
      where: { id: meetingId },
      data: {
        status: "ready",
        actionsConfirmed: false,
      },
    });
  });

  return getMeetingById(meetingId);
};

export const approveMeeting = async (meetingId: string) => {
  const meeting = await prisma.meeting.findUnique({
    where: { id: meetingId },
    include: {
      actions: true,
    },
  });
  if (!meeting) return null;
  if (meeting.status !== "ready") {
    return { error: "Meeting is not ready for approval" as const };
  }
  if (!meeting.actionsConfirmed) {
    return { error: "Action plan is not confirmed yet" as const };
  }

  const now = new Date();

  await prisma.$transaction(async (tx) => {
    await tx.meeting.update({
      where: { id: meetingId },
      data: { status: "approved" },
    });

    if (meeting.attendees.length > 0) {
      await tx.emailLog.createMany({
        data: meeting.attendees.map((attendee) => ({
          id: crypto.randomUUID(),
          meetingId,
          recipient: attendee,
          type: "summary",
          payload: { subject: `OrbitPlan Summary: ${meeting.title}` },
          sentAt: now,
        })),
      });
    }

    if (meeting.actions.length > 0) {
      await tx.emailLog.createMany({
        data: meeting.actions.map((action) => ({
          id: crypto.randomUUID(),
          meetingId,
          recipient: action.ownerEmail,
          type: "action",
          payload: { subject: `OrbitPlan Action: ${meeting.title}`, action: action.description },
          sentAt: now,
        })),
      });
    }
  });

  return getMeetingById(meetingId);
};

export const appendMeetingChatMessages = async (
  meetingId: string,
  messages: Array<{ role: "user" | "assistant"; text: string; citations?: string[] }>,
) => {
  const meeting = await prisma.meeting.findUnique({ where: { id: meetingId }, select: { id: true } });
  if (!meeting) return null;

  const saved: MeetingChatMessage[] = [];
  for (const message of messages) {
    const created = await prisma.meetingChatMessage.create({
      data: {
        id: crypto.randomUUID(),
        meetingId,
        role: message.role,
        text: message.text,
        citations: message.citations ?? [],
      },
    });
    saved.push(mapChatMessage(created));
  }

  return saved;
};

export const getMeetingChatHistory = async (meetingId: string, options?: { limit?: number; before?: string }) => {
  const meeting = await prisma.meeting.findUnique({ where: { id: meetingId }, select: { id: true } });
  if (!meeting) return null;

  const limit = Math.max(1, Math.min(100, options?.limit ?? 20));
  const before = options?.before ? new Date(options.before) : undefined;

  const messages = await prisma.meetingChatMessage.findMany({
    where: {
      meetingId,
      ...(before ? { createdAt: { lt: before } } : {}),
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
  });

  const hasMore = messages.length > limit;
  const page = hasMore ? messages.slice(0, limit) : messages;
  const nextBefore = hasMore ? page[page.length - 1]?.createdAt.toISOString() ?? null : null;

  return {
    messages: page.reverse().map(mapChatMessage),
    nextBefore,
  };
};

export const clearMeetingChatHistory = async (meetingId: string) => {
  const meeting = await prisma.meeting.findUnique({ where: { id: meetingId }, select: { id: true } });
  if (!meeting) return null;

  const deleted = await prisma.meetingChatMessage.deleteMany({
    where: { meetingId },
  });

  return { cleared: deleted.count };
};

export const updateMeetingAction = async (
  meetingId: string,
  actionId: string,
  patch: { status?: ActionStatus; priority?: ActionPriority },
) => {
  const meeting = await prisma.meeting.findUnique({ where: { id: meetingId }, select: { id: true } });
  if (!meeting) return null;

  const action = await prisma.actionItem.findFirst({
    where: { id: actionId, meetingId },
    select: { id: true },
  });
  if (!action) return { error: "Action not found" as const };

  await prisma.actionItem.update({
    where: { id: actionId },
    data: {
      ...(patch.status ? { status: patch.status } : {}),
      ...(patch.priority ? { priority: patch.priority } : {}),
    },
  });

  return getMeetingById(meetingId);
};

export const deleteMeetingAction = async (meetingId: string, actionId: string) => {
  const meeting = await prisma.meeting.findUnique({ where: { id: meetingId }, select: { id: true } });
  if (!meeting) return null;

  const deleted = await prisma.actionItem.deleteMany({
    where: { meetingId, id: actionId },
  });
  if (deleted.count === 0) {
    return { error: "Action not found" as const };
  }

  return getMeetingById(meetingId);
};

export const confirmMeetingActions = async (meetingId: string, confirmed: boolean) => {
  const meeting = await prisma.meeting.findUnique({
    where: { id: meetingId },
    select: { id: true, attendees: true },
  });
  if (!meeting) return null;

  if (confirmed) {
    await prisma.meeting.update({
      where: { id: meetingId },
      data: { actionsConfirmed: true },
    });
    return getMeetingById(meetingId);
  }

  const fallbackOwner = meeting.attendees[0] ?? "unassigned@orbitplan.local";
  await prisma.$transaction(async (tx) => {
    await tx.actionItem.deleteMany({
      where: { meetingId },
    });
    await tx.actionItem.create({
      data: {
        id: crypto.randomUUID(),
        meetingId,
        ownerEmail: fallbackOwner,
        description: "Review and confirm generated action items.",
        confidence: 0.7,
        status: "open",
        priority: "medium",
        jiraIssueKey: null,
        jiraIssueUrl: null,
        jiraCloudId: null,
        jiraProjectKey: null,
        jiraSyncStatus: "not_linked",
        jiraSyncError: null,
      },
    });
    await tx.meeting.update({
      where: { id: meetingId },
      data: { actionsConfirmed: true },
    });
  });

  return getMeetingById(meetingId);
};

export const createMeetingEmailLogs = async (
  meetingId: string,
  entries: Array<{
    recipient: string;
    type: "summary" | "action";
    payload: Record<string, string>;
  }>,
): Promise<EmailLog[]> => {
  if (entries.length === 0) return [];

  const createdLogs: EmailLog[] = [];
  const now = new Date();

  for (const entry of entries) {
    const created = await prisma.emailLog.create({
      data: {
        id: crypto.randomUUID(),
        meetingId,
        recipient: entry.recipient,
        type: entry.type,
        payload: entry.payload,
        sentAt: now,
      },
    });
    createdLogs.push(mapEmailLog(created));
  }

  return createdLogs;
};

export const linkActionToJiraIssue = async (
  actionId: string,
  input: { jiraIssueKey: string; jiraIssueUrl: string; jiraCloudId: string; jiraProjectKey: string },
) => {
  const updated = await prisma.actionItem.update({
    where: { id: actionId },
    data: {
      ...input,
      jiraSyncStatus: "synced",
      jiraSyncError: null,
    },
  });
  return mapAction(updated);
};

export const setActionJiraSyncState = async (
  actionId: string,
  input: { jiraSyncStatus: JiraSyncStatus; jiraSyncError?: string | null },
) => {
  const updated = await prisma.actionItem.update({
    where: { id: actionId },
    data: {
      jiraSyncStatus: input.jiraSyncStatus,
      jiraSyncError: input.jiraSyncError ?? null,
    },
  });
  return mapAction(updated);
};

export const updateActionFromJira = async (
  actionId: string,
  patch: { description?: string; dueDate?: string | null; priority?: ActionPriority; status?: ActionStatus },
) => {
  const updated = await prisma.actionItem.update({
    where: { id: actionId },
    data: {
      ...(patch.description ? { description: patch.description } : {}),
      ...(patch.dueDate !== undefined ? { dueDate: patch.dueDate } : {}),
      ...(patch.priority ? { priority: patch.priority } : {}),
      ...(patch.status ? { status: patch.status } : {}),
    },
  });
  return mapAction(updated);
};
