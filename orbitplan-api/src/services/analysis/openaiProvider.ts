import OpenAI from "openai";
import { z } from "zod";
import { env } from "../../config/env.js";
import { MEETING_ANALYSIS_SYSTEM_PROMPT } from "../../prompts/meetingAnalysis.js";
import { withOpenAiRetry } from "../openai/retry.js";
import { extractActionsFromTranscript, finalizeActions, generateStarterActionsFromIntent } from "./actionExtraction.js";
import type { AnalysisInput, AnalysisProvider, AnalysisResult } from "./types.js";

const isoDateRegex = /^\d{4}-\d{2}-\d{2}$/;

const toBulletBlock = (items: string[], fallback: string) => {
  const cleaned = items.map((item) => item.trim()).filter(Boolean);
  return cleaned.length > 0 ? cleaned.map((item) => `- ${item}`).join("\n") : `- ${fallback}`;
};

const buildStructuredNotes = (summary: string, nextSteps: string[]) =>
  [
    "Summary:",
    summary.trim() || "No concise summary available.",
    "",
    "Next Steps:",
    toBulletBlock(nextSteps, "Review transcript and assign concrete next actions."),
  ].join("\n");

const guessOwnerEmail = (description: string, attendees: string[]): string | undefined => {
  const lowerDescription = description.toLowerCase();
  for (const attendee of attendees) {
    const local = attendee.split("@")[0]?.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (!local) continue;
    if (lowerDescription.includes(local)) return attendee;
  }
  return attendees[0];
};

const normalizeActions = (actions: Array<{ description: string; ownerEmail?: string; dueDate?: string; confidence: number }>, attendees: string[]) => {
  const dedupe = new Set<string>();
  return actions
    .map((action) => {
      const description = action.description.trim();
      const ownerEmail =
        action.ownerEmail && z.string().email().safeParse(action.ownerEmail).success
          ? action.ownerEmail
          : guessOwnerEmail(description, attendees);
      const dueDate = action.dueDate && isoDateRegex.test(action.dueDate) ? action.dueDate : undefined;
      const confidence = Math.min(1, Math.max(0, Number.isFinite(action.confidence) ? action.confidence : 0.7));

      return { description, ownerEmail, dueDate, confidence };
    })
    .filter((action) => action.description.length > 0)
    .filter((action) => {
      const key = `${action.description}|${action.ownerEmail ?? ""}`.toLowerCase();
      if (dedupe.has(key)) return false;
      dedupe.add(key);
      return true;
    });
};

const fallbackAnalysis = (input: AnalysisInput): AnalysisResult => {
  const decision = input.transcript.split(/[.!?]\s/).find((item) => item.trim().length > 0)?.trim();
  const nextSteps = ["Assign owners to each action item", "Confirm due dates before approval"];
  const extractedActions = extractActionsFromTranscript(input.transcript, input.attendees);
  const starterActions = generateStarterActionsFromIntent(input.transcript, input.attendees, input.meetingTitle);
  return {
    decisions: toBulletBlock([decision ?? ""], "No clear decision detected. Review transcript."),
    risks: "Review action owners and due dates before approval.",
    notes: buildStructuredNotes(input.transcript.slice(0, 320), nextSteps),
    actions: finalizeActions(normalizeActions(extractedActions, input.attendees), normalizeActions(starterActions, input.attendees), input.attendees),
  };
};

const AnalysisResponseSchema = z.object({
  decisions: z.union([z.string().min(1), z.array(z.string()).default([])]),
  risks: z.union([z.string().min(1), z.array(z.string()).default([])]),
  notes: z.union([
    z.string().min(1),
    z.object({
      summary: z.string().default(""),
      nextSteps: z.array(z.string()).default([]),
    }),
  ]),
  actions: z
    .array(
      z.object({
        description: z.string().min(1),
        ownerEmail: z.string().email().optional().nullable(),
        dueDate: z.string().optional().nullable(),
        confidence: z.coerce.number().min(0).max(1),
      }),
    )
    .default([]),
});

export class OpenAiAnalysisProvider implements AnalysisProvider {
  private readonly client: OpenAI;

  constructor(apiKey: string) {
    this.client = new OpenAI({ apiKey });
  }

  async analyze(input: AnalysisInput): Promise<AnalysisResult> {
    const completion = await withOpenAiRetry(() =>
      this.client.chat.completions.create({
        model: "gpt-4o-mini",
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: MEETING_ANALYSIS_SYSTEM_PROMPT,
          },
          {
            role: "user",
            content: JSON.stringify({
              meetingTitle: input.meetingTitle,
              attendees: input.attendees,
              transcript: input.transcript,
            }),
          },
        ],
      }, {
        timeout: env.aiTimeoutMs,
      }),
    );

    const raw = completion.choices[0]?.message?.content;
    if (!raw) {
      throw new Error("OpenAI returned empty analysis response");
    }

    let parsedBody: unknown;
    try {
      parsedBody = JSON.parse(raw);
    } catch {
      return fallbackAnalysis(input);
    }

    const parsed = AnalysisResponseSchema.safeParse(parsedBody);
    if (!parsed.success) {
      return fallbackAnalysis(input);
    }

    const decisions =
      typeof parsed.data.decisions === "string"
        ? toBulletBlock([parsed.data.decisions], "No clear decision detected. Review transcript.")
        : toBulletBlock(parsed.data.decisions, "No clear decision detected. Review transcript.");

    const risks =
      typeof parsed.data.risks === "string"
        ? parsed.data.risks
        : toBulletBlock(parsed.data.risks, "Review unresolved risks before approval.");

    const notes =
      typeof parsed.data.notes === "string"
        ? buildStructuredNotes(parsed.data.notes, [])
        : buildStructuredNotes(parsed.data.notes.summary, parsed.data.notes.nextSteps);

    return {
      decisions,
      risks,
      notes,
      actions: finalizeActions(
        normalizeActions(
          parsed.data.actions.map((action) => ({
            description: action.description,
            ownerEmail: action.ownerEmail ?? undefined,
            dueDate: action.dueDate ?? undefined,
            confidence: action.confidence,
          })),
          input.attendees,
        ),
        normalizeActions(generateStarterActionsFromIntent(input.transcript, input.attendees, input.meetingTitle), input.attendees),
        input.attendees,
      ),
    };
  }
}
