import type { ActionItem } from "../../../../types/action.js";
import type {
  JiraIssueTypeCreateMeta,
  JiraScanResult,
  JiraTicketDetails,
  TicketFormatPreset,
} from "../../../../types/jira.js";
import type { CanonicalExecutionPayload } from "../../../execution/types.js";

const createParagraph = (text: string) => ({
  type: "paragraph",
  content: [{ type: "text", text }],
});

const toPriorityLabel = (priority: string) => (priority === "high" ? "High" : priority === "low" ? "Low" : "Medium");

const buildTicketSummary = (input: {
  format: TicketFormatPreset;
  actionDescription: string;
  ownerEmail: string;
  priority: string;
}) => {
  switch (input.format) {
    case "engineering":
      return `[ENG][${toPriorityLabel(input.priority)}] ${input.actionDescription}`;
    case "operations":
      return `[OPS] ${input.actionDescription} (${input.ownerEmail})`;
    case "compliance":
      return `[CTRL] ${input.actionDescription}`;
    case "enterprise":
    default:
      return input.actionDescription;
  }
};

const toAdfDescription = (input: {
  format: TicketFormatPreset;
  meetingTitle: string;
  ownerEmail: string;
  priority: string;
  dueDate?: string;
  transcript?: string;
  actionDescription: string;
  decisions?: string;
  risks?: string;
  notes?: string;
  environment?: string;
  additionalContext?: string;
}) => {
  const base = [
    createParagraph(`Imported from OrbitPlan: ${input.meetingTitle}`),
    createParagraph(`Owner: ${input.ownerEmail}`),
    createParagraph(`Priority: ${toPriorityLabel(input.priority)}`),
    ...(input.dueDate ? [createParagraph(`Due date: ${input.dueDate}`)] : []),
    ...(input.environment ? [createParagraph(`Environment: ${input.environment}`)] : []),
  ];

  switch (input.format) {
    case "engineering":
      return {
        type: "doc",
        version: 1,
        content: [
          ...base,
          createParagraph(`Implementation notes: ${input.actionDescription}`),
          createParagraph(`Dependencies: ${input.notes || "Review meeting dependencies before implementation."}`),
          createParagraph("QA checklist: Validate expected behavior and confirm acceptance criteria."),
          createParagraph(`Release notes: ${input.decisions || "No release note summary captured."}`),
          ...(input.additionalContext ? [createParagraph(`Additional context: ${input.additionalContext}`)] : []),
          ...(input.transcript ? [createParagraph(`Transcript excerpt: ${input.transcript}`)] : []),
        ],
      };
    case "operations":
      return {
        type: "doc",
        version: 1,
        content: [
          ...base,
          createParagraph(`Operational impact: ${input.actionDescription}`),
          createParagraph(`Execution readiness: ${input.notes || "Review staffing, timing, and handoff requirements."}`),
          createParagraph(`Stakeholders: ${input.ownerEmail}`),
          createParagraph(`Runbook notes: ${input.transcript || "No transcript excerpt available."}`),
          ...(input.additionalContext ? [createParagraph(`Additional context: ${input.additionalContext}`)] : []),
        ],
      };
    case "compliance":
      return {
        type: "doc",
        version: 1,
        content: [
          ...base,
          createParagraph(`Control objective: ${input.actionDescription}`),
          createParagraph(`Risk statement: ${input.risks || "Risk detail was not captured in the meeting summary."}`),
          createParagraph(`Evidence: ${input.transcript || "Attach evidence or transcript excerpts before closure."}`),
          createParagraph(`Approval trail: Derived from meeting "${input.meetingTitle}" and routed by OrbitPlan.`),
          ...(input.additionalContext ? [createParagraph(`Additional context: ${input.additionalContext}`)] : []),
        ],
      };
    case "enterprise":
    default:
      return {
        type: "doc",
        version: 1,
        content: [
          ...base,
          createParagraph(`Business outcome: ${input.actionDescription}`),
          createParagraph(`Scope: ${input.decisions || "Review the meeting summary for scope confirmation."}`),
          createParagraph(`Acceptance criteria: ${input.notes || "Confirm completion with the meeting owner."}`),
          ...(input.additionalContext ? [createParagraph(`Additional context: ${input.additionalContext}`)] : []),
          ...(input.transcript ? [createParagraph(`Transcript excerpt: ${input.transcript}`)] : []),
        ],
      };
  }
};

const normalizeActionKey = (value: string) => value.toLowerCase().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim();
const looksTooVague = (value: string) =>
  /\b(review|check|look into|discuss|follow up|handle|work on|investigate)\b/i.test(value) && value.split(/\s+/).length < 6;
const hasFieldValue = (value: unknown): boolean => {
  if (value == null) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value as Record<string, unknown>).length > 0;
  return true;
};
const isCoreSatisfiedField = (
  fieldKey: string,
  ticketDetails: JiraTicketDetails,
  action: ActionItem,
  selectedIssueTypeName: string,
) => {
  switch (fieldKey) {
    case "project":
    case "summary":
    case "description":
      return true;
    case "issuetype":
      return Boolean(selectedIssueTypeName.trim());
    case "labels":
      return hasFieldValue(ticketDetails.labels);
    case "components":
      return hasFieldValue(ticketDetails.components);
    case "environment":
      return hasFieldValue(ticketDetails.environment);
    case "duedate":
      return hasFieldValue(action.dueDate);
    case "priority":
      return true;
    default:
      return false;
  }
};

export const jiraExecution = {
  buildIssueFields(input: {
    payload: CanonicalExecutionPayload;
    action: ActionItem;
    projectKey: string;
    format: TicketFormatPreset;
    ticketDetails: JiraTicketDetails;
    withPriority: boolean;
  }): Record<string, unknown> {
    const { payload, action, projectKey, format, ticketDetails, withPriority } = input;

    return {
      project: { key: projectKey },
      summary: buildTicketSummary({
        format,
        actionDescription: action.description,
        ownerEmail: action.ownerEmail,
        priority: action.priority,
      }),
      issuetype: { name: ticketDetails.issueType?.trim() || "Task" },
      description: toAdfDescription({
        format,
        meetingTitle: payload.meeting.title,
        ownerEmail: action.ownerEmail,
        priority: action.priority,
        dueDate: action.dueDate,
        actionDescription: action.description,
        decisions: payload.summary?.decisions,
        risks: payload.summary?.risks,
        notes: payload.summary?.notes,
        environment: ticketDetails.environment,
        additionalContext: ticketDetails.additionalContext,
        transcript: payload.transcript?.text.slice(0, 200),
      }),
      ...(ticketDetails.labels && ticketDetails.labels.length > 0 ? { labels: ticketDetails.labels } : {}),
      ...(ticketDetails.components && ticketDetails.components.length > 0
        ? { components: ticketDetails.components.map((component) => ({ name: component })) }
        : {}),
      ...(action.dueDate ? { duedate: action.dueDate } : {}),
      ...(withPriority
        ? {
            priority: {
              name: action.priority === "high" ? "High" : action.priority === "low" ? "Low" : "Medium",
            },
          }
        : {}),
      ...(ticketDetails.advancedFields ?? {}),
    };
  },

  buildScanResult(input: {
    payload: CanonicalExecutionPayload;
    projectKey: string;
    ticketDetails: JiraTicketDetails;
    issueTypes: JiraIssueTypeCreateMeta[];
  }): JiraScanResult {
    const { payload, projectKey, ticketDetails, issueTypes } = input;
    const selectedIssueTypeName = ticketDetails.issueType?.trim() || "Task";
    const selectedIssueType =
      issueTypes.find((issueType) => issueType.name === selectedIssueTypeName || issueType.id === selectedIssueTypeName) ?? null;
    const requiredFields = (selectedIssueType?.fields ?? []).filter((field) => field.required);

    const duplicateCounts = new Map<string, number>();
    for (const action of payload.actions) {
      const key = normalizeActionKey(action.description);
      duplicateCounts.set(key, (duplicateCounts.get(key) ?? 0) + 1);
    }

    const items = payload.actions.map((action) => {
      const reasons: string[] = [];
      const normalizedKey = normalizeActionKey(action.description);

      if (action.description.trim().length < 12) {
        reasons.push("Action title is too short for a production Jira ticket.");
      }
      if (looksTooVague(action.description)) {
        reasons.push("Action is too vague. Make the outcome more specific before export.");
      }
      if ((duplicateCounts.get(normalizedKey) ?? 0) > 1) {
        reasons.push("Possible duplicate action detected in this meeting.");
      }
      if (!action.ownerEmail || action.ownerEmail === "unassigned@orbitplan.local") {
        reasons.push("No real owner is assigned.");
      }
      if (action.confidence < 0.55) {
        reasons.push("Low extraction confidence. Review before export.");
      }
      if (!selectedIssueType) {
        reasons.push(`Issue type "${selectedIssueTypeName}" is not available for project ${projectKey}.`);
      } else {
        for (const field of requiredFields) {
          const isSatisfiedByCore = isCoreSatisfiedField(field.key, ticketDetails, action, selectedIssueType.name);
          const isSatisfiedByAdvanced = hasFieldValue(ticketDetails.advancedFields?.[field.key]);
          if (!isSatisfiedByCore && !isSatisfiedByAdvanced) {
            reasons.push(`Missing required Jira field: ${field.name}.`);
          }
        }
      }

      return {
        actionId: action.id,
        description: action.description,
        status: reasons.length === 0 ? ("ready" as const) : ("blocked" as const),
        reasons,
      };
    });

    return {
      readyCount: items.filter((item) => item.status === "ready").length,
      blockedCount: items.filter((item) => item.status === "blocked").length,
      items,
    };
  },
};
