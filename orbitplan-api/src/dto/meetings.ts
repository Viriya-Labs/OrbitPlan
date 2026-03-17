import { z } from "zod";

export const MeetingCreateSchema = z.object({
  title: z.string().min(1),
  scheduledAt: z.string().datetime().optional(),
  attendees: z.array(z.string().email()).default([]),
  source: z.enum(["upload", "record"]).default("upload"),
});

export type MeetingCreateDTO = z.infer<typeof MeetingCreateSchema>;

export const MeetingResponseSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(["created", "processing", "ready", "approved", "error"]),
  title: z.string(),
  scheduledAt: z.string().datetime().optional(),
  attendees: z.array(z.string().email()),
  source: z.enum(["upload", "record"]),
  provider: z.enum(["zoom", "teams"]).optional(),
  externalMeetingId: z.string().optional(),
  externalRecordId: z.string().optional(),
  externalUrl: z.string().url().optional(),
  organizerEmail: z.string().email().optional(),
  actionsConfirmed: z.boolean(),
  createdAt: z.string().datetime(),
});

export type MeetingResponseDTO = z.infer<typeof MeetingResponseSchema>;
