"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Document, Packer, Paragraph, TextRun } from "docx";
import { AnimatePresence, motion } from "framer-motion";
import { jsPDF } from "jspdf";
import { useParams } from "next/navigation";
import { RequireAuth } from "@/components/auth/require-auth";
import { Tabs } from "@/components/aceternity/tabs";
import { EmailExecutionPanel } from "@/components/review/email-execution-panel";
import { ExecutionHubModal } from "@/components/review/execution-hub-modal";
import { JiraExecutionPanel } from "@/components/review/jira-execution-panel";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { StatusPill } from "@/components/ui/status-pill";
import {
  approveMeeting,
  askMeetingQuestion,
  clearMeetingChatHistory,
  confirmMeetingActions,
  deleteMeetingAction,
  disconnectJira,
  exportMeetingToEmail,
  exportMeetingToJira,
  getMeeting,
  getMeetingChatHistory,
  getJiraAuthUrl,
  getJiraCreateMeta,
  getJiraLookup,
  getJiraProjects,
  scanMeetingToJira,
  getJiraSites,
  getJiraStatus,
  getProcessingErrorMessage,
  processMeeting,
  resyncMeetingAction,
  updateMeetingAction,
} from "@/lib/api";
import type { ActionPriority, ActionStatus } from "@/types/action";
import type { ChatMessage } from "@/types/chat";
import type { EmailExportResult, EmailRecipientMode, ExecutionDestination } from "@/types/execution";
import type {
  JiraCreateFieldMeta,
  JiraIssueTypeCreateMeta,
  JiraLookupItem,
  JiraExportResult,
  JiraIntegrationStatus,
  JiraProject,
  JiraScanResult,
  JiraSite,
} from "@/types/jira";
import type { MeetingDetail } from "@/types/meetingDetail";

const statusTone = (status: string): "neutral" | "success" | "warning" => {
  if (status === "approved") return "success";
  if (status === "ready") return "warning";
  return "neutral";
};

type WorkspaceTab = "summary" | "chat";
type DownloadFormat = "txt" | "csv" | "pdf" | "docx";
type TicketFormatPreset = "enterprise" | "engineering" | "operations" | "compliance";
type SettingsPanelTab = "export-target" | "project" | "formats" | "fields" | "automation";
type ActionViewFilter = "all" | ActionStatus;
type JiraExportStage = "idle" | "scanning" | "blocked" | "exporting" | "complete";
type EmailExportStage = "idle" | "exporting" | "complete";
type ExecutionHubTab = ExecutionDestination;
type JiraExecutionState = {
  stage: JiraExportStage;
  exporting: boolean;
  result: JiraExportResult | null;
  scanResult: JiraScanResult | null;
  config: {
    cloudId: string;
    projectKey: string;
    ticketDetails: JiraTicketDetailsDraft;
    dynamicFieldValues: JiraDynamicFieldValues;
    lookupQueries: Record<string, string>;
    lookupResults: Record<string, JiraLookupItem[]>;
    lookupLoading: Record<string, boolean>;
  };
};
type EmailExecutionState = {
  stage: EmailExportStage;
  exporting: boolean;
  result: EmailExportResult | null;
  config: {
    recipientMode: EmailRecipientMode;
    customRecipients: string;
    subject: string;
  };
};
type ExecutionState = {
  activeDestination: ExecutionHubTab;
  jira: JiraExecutionState;
  email: EmailExecutionState;
};
type JiraTicketDetailsDraft = {
  issueType: string;
  labelsText: string;
  componentsText: string;
  environment: string;
  additionalContext: string;
  advancedFieldsJson: string;
};
type JiraDynamicFieldValues = Record<string, string | string[]>;
const CHAT_PAGE_SIZE = 20;

const TICKET_FORMAT_PRESETS: Array<{
  id: TicketFormatPreset;
  label: string;
  description: string;
  sections: string[];
}> = [
  {
    id: "enterprise",
    label: "Enterprise Standard",
    description: "Balanced ticket structure for cross-functional teams with clear outcomes, ownership, and acceptance criteria.",
    sections: ["Business outcome", "Scope", "Owner", "Acceptance criteria"],
  },
  {
    id: "engineering",
    label: "Engineering Delivery",
    description: "Technical format for product and engineering teams with implementation notes, dependencies, and QA detail.",
    sections: ["Implementation notes", "Dependencies", "QA checklist", "Release notes"],
  },
  {
    id: "operations",
    label: "Operations Handoff",
    description: "Operational template focused on impact, urgency, support context, and execution readiness.",
    sections: ["Operational impact", "Priority", "Runbook notes", "Stakeholders"],
  },
  {
    id: "compliance",
    label: "Compliance Audit",
    description: "Controlled format for regulated workflows with approvals, evidence, risk statements, and rollback planning.",
    sections: ["Control objective", "Risk", "Evidence", "Approval trail"],
  },
];
const STEP_FOUR_DELIVERY_OPTIONS: Array<{
  id: TicketFormatPreset;
  title: string;
  detail: string;
  accentClass: string;
}> = [
  {
    id: "engineering",
    title: "Engineering",
    detail: "Implementation-focused Jira delivery for product and engineering teams.",
    accentClass:
      "border-[rgba(108,242,255,0.26)] bg-[linear-gradient(135deg,rgba(108,242,255,0.1)_0%,rgba(30,123,255,0.08)_100%)] hover:border-[rgba(108,242,255,0.42)]",
  },
  {
    id: "enterprise",
    title: "General",
    detail: "Balanced Jira tickets for broader business and cross-functional work.",
    accentClass:
      "border-[rgba(120,145,255,0.24)] bg-[linear-gradient(135deg,rgba(120,145,255,0.1)_0%,rgba(255,255,255,0.04)_100%)] hover:border-[rgba(120,145,255,0.38)]",
  },
  {
    id: "operations",
    title: "Operations",
    detail: "Operational handoff format for support, rollout, and internal execution.",
    accentClass:
      "border-[rgba(255,213,106,0.26)] bg-[linear-gradient(135deg,rgba(255,213,106,0.1)_0%,rgba(30,123,255,0.08)_100%)] hover:border-[rgba(255,213,106,0.42)]",
  },
  {
    id: "compliance",
    title: "Compliance",
    detail: "Controlled export format for regulated and audit-heavy workflows.",
    accentClass:
      "border-[rgba(255,107,122,0.26)] bg-[linear-gradient(135deg,rgba(255,107,122,0.1)_0%,rgba(143,56,255,0.08)_100%)] hover:border-[rgba(255,107,122,0.42)]",
  },
];
const EXECUTION_DESTINATION_OPTIONS: Array<{
  id: ExecutionDestination;
  title: string;
  detail: string;
}> = [
  {
    id: "jira",
    title: "Jira",
    detail: "Create linked execution tickets for product, engineering, and operations work.",
  },
  {
    id: "email",
    title: "Email",
    detail: "Send an action-plan follow-up to attendees, owners, or custom recipients.",
  },
];
const JIRA_EXPORT_LOADING_STATES = [
  {
    title: "Scanning",
    description: "Checking ticket quality and Jira project requirements.",
  },
  {
    title: "Validating",
    description: "Gating blocked tickets before Jira creation.",
  },
  {
    title: "Exporting",
    description: "Creating Jira issues and linking them back.",
  },
] as const;

const DEFAULT_JIRA_TICKET_DETAILS: JiraTicketDetailsDraft = {
  issueType: "Task",
  labelsText: "orbitplan",
  componentsText: "",
  environment: "",
  additionalContext: "",
  advancedFieldsJson: "",
};
const DEFAULT_EXECUTION_STATE: ExecutionState = {
  activeDestination: "jira",
  jira: {
    stage: "idle",
    exporting: false,
    result: null,
    scanResult: null,
    config: {
      cloudId: "",
      projectKey: "",
      ticketDetails: DEFAULT_JIRA_TICKET_DETAILS,
      dynamicFieldValues: {},
      lookupQueries: {},
      lookupResults: {},
      lookupLoading: {},
    },
  },
  email: {
    stage: "idle",
    exporting: false,
    result: null,
    config: {
      recipientMode: "attendees",
      customRecipients: "",
      subject: "",
    },
  },
};

const ACTION_STATUS_OPTIONS: Array<{ value: ActionStatus; label: string }> = [
  { value: "open", label: "Open" },
  { value: "in_progress", label: "In Progress" },
  { value: "done", label: "Done" },
];

const ACTION_PRIORITY_OPTIONS: Array<{ value: ActionPriority; label: string }> = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
];

const statusBadgeClass: Record<ActionStatus, string> = {
  open: "border-[rgba(255,213,106,0.45)] bg-[rgba(255,213,106,0.16)] text-[var(--warning)]",
  in_progress: "border-[rgba(108,242,255,0.45)] bg-[rgba(108,242,255,0.15)] text-[var(--accent)]",
  done: "border-[rgba(56,255,179,0.45)] bg-[rgba(56,255,179,0.15)] text-[var(--success)]",
};

const priorityBadgeClass: Record<ActionPriority, string> = {
  low: "border-[rgba(108,242,255,0.35)] bg-[rgba(108,242,255,0.13)] text-[var(--accent)]",
  medium: "border-[rgba(255,213,106,0.4)] bg-[rgba(255,213,106,0.16)] text-[var(--warning)]",
  high: "border-[rgba(255,107,122,0.45)] bg-[rgba(255,107,122,0.15)] text-[var(--danger)]",
};

const jiraSyncBadgeClass = {
  not_linked: "border-[rgba(120,145,255,0.24)] bg-[rgba(255,255,255,0.05)] text-[var(--text-muted)]",
  synced: "border-[rgba(56,255,179,0.4)] bg-[rgba(56,255,179,0.14)] text-[var(--success)]",
  sync_failed: "border-[rgba(255,107,122,0.45)] bg-[rgba(255,107,122,0.14)] text-[var(--danger)]",
} as const;

const jiraSyncLabel = {
  not_linked: "Not Linked",
  synced: "Synced",
  sync_failed: "Sync Failed",
} as const;

const formatActionStatusLabel = (status: ActionStatus) => ACTION_STATUS_OPTIONS.find((option) => option.value === status)?.label ?? status;
const formatActionPriorityLabel = (priority: ActionPriority) =>
  ACTION_PRIORITY_OPTIONS.find((option) => option.value === priority)?.label ?? priority;
const actionFilterLabel: Record<ActionViewFilter, string> = {
  all: "All",
  open: "Open",
  in_progress: "In Progress",
  done: "Done",
};

type PlatformSyncState = "connected" | "available" | "not_connected";
type ReviewSidebarTool =
  | "integrations"
  | "approval"
  | "transcript"
  | "summary"
  | "chat"
  | "tickets"
  | "people"
  | "files"
  | "timeline"
  | "notifications"
  | "settings";

const platformStateMeta: Record<
  PlatformSyncState,
  { label: string; tone: "neutral" | "success" | "warning"; description: string }
> = {
  connected: {
    label: "Connected",
    tone: "success",
    description: "Your account is synced and ready to create tickets.",
  },
  available: {
    label: "Available",
    tone: "warning",
    description: "Integration support exists, but this account is not connected yet.",
  },
  not_connected: {
    label: "Not Connected",
    tone: "neutral",
    description: "This platform is not linked for ticket sync yet.",
  },
};

const executionDestinationStateMeta: Record<
  "ready" | "attention" | "available",
  { label: string; tone: "neutral" | "success" | "warning"; description: string }
> = {
  ready: {
    label: "Ready",
    tone: "success",
    description: "This destination is configured and can be used from the execution hub.",
  },
  attention: {
    label: "Needs Setup",
    tone: "warning",
    description: "This destination is available, but still needs configuration before delivery.",
  },
  available: {
    label: "Available",
    tone: "neutral",
    description: "This destination is available from the execution hub.",
  },
};

function ChatTypingIndicator() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 6 }}
      className="mr-auto flex max-w-[92%] items-end gap-2"
    >
      <div className="flex h-8 w-8 items-center justify-center rounded-full border border-[rgba(143,56,255,0.42)] bg-[rgba(143,56,255,0.22)] text-[10px] font-bold text-[var(--text-primary)]">
        OP
      </div>
      <div className="rounded-2xl border border-[rgba(143,56,255,0.35)] bg-[rgba(143,56,255,0.15)] px-3 py-2">
        <div className="flex items-center gap-1.5">
          <span className="loader-pulse-dot" />
          <span className="loader-pulse-dot" />
          <span className="loader-pulse-dot" />
        </div>
      </div>
    </motion.div>
  );
}

function ChatConversationBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";
  const timestamp = message.createdAt
    ? new Date(message.createdAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
    : "";

  return (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className={`flex max-w-[92%] items-end gap-2 ${isUser ? "ml-auto flex-row-reverse" : "mr-auto"}`}
    >
      <div
        className={`flex h-8 w-8 items-center justify-center rounded-full border text-[10px] font-bold ${
          isUser
            ? "border-[rgba(30,123,255,0.42)] bg-[rgba(30,123,255,0.22)] text-[var(--text-primary)]"
            : "border-[rgba(143,56,255,0.42)] bg-[rgba(143,56,255,0.22)] text-[var(--text-primary)]"
        }`}
      >
        {isUser ? "YOU" : "OP"}
      </div>

      <div
        className={`rounded-2xl border px-3 py-2 text-sm ${
          isUser
            ? "border-[rgba(30,123,255,0.35)] bg-[rgba(30,123,255,0.18)] text-[var(--text-primary)]"
            : "border-[rgba(143,56,255,0.35)] bg-[rgba(143,56,255,0.15)] text-[var(--text-secondary)]"
        }`}
      >
        <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.08em]">
          {isUser ? "You" : "OrbitBot"}
        </p>
        <p className="whitespace-pre-wrap">{message.text}</p>
        {timestamp && <p className="mt-2 text-[10px] text-[var(--text-muted)]">{timestamp}</p>}
        {message.citations && message.citations.length > 0 && (
          <div className="mt-2 border-t border-[var(--border)] pt-2 text-xs">
            {message.citations.map((citation, idx) => (
              <p key={`${message.id}-c-${idx}`}>- {citation}</p>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
}

export default function ReviewPage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<MeetingDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [approving, setApproving] = useState(false);
  const [retryingProcess, setRetryingProcess] = useState(false);
  const [question, setQuestion] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatCursor, setChatCursor] = useState<string | null>(null);
  const [chatHasMore, setChatHasMore] = useState(false);
  const [chatHistoryLoading, setChatHistoryLoading] = useState(false);
  const [chatClearing, setChatClearing] = useState(false);
  const [confirmClearOpen, setConfirmClearOpen] = useState(false);
  const [updatingActionId, setUpdatingActionId] = useState<string | null>(null);
  const [resyncingActionId, setResyncingActionId] = useState<string | null>(null);
  const [confirmingActions, setConfirmingActions] = useState<"accept" | "fallback" | null>(null);
  const [deletingActionId, setDeletingActionId] = useState<string | null>(null);
  const [jiraStatus, setJiraStatus] = useState<JiraIntegrationStatus | null>(null);
  const [jiraSites, setJiraSites] = useState<JiraSite[]>([]);
  const [jiraProjects, setJiraProjects] = useState<JiraProject[]>([]);
  const [jiraLoading, setJiraLoading] = useState(false);
  const [jiraDisconnecting, setJiraDisconnecting] = useState(false);
  const [executionState, setExecutionState] = useState<ExecutionState>(DEFAULT_EXECUTION_STATE);
  const [jiraExportModalOpen, setJiraExportModalOpen] = useState(false);
  const [jiraConnectedNotice, setJiraConnectedNotice] = useState(false);
  const [activeSidebarTool, setActiveSidebarTool] = useState<ReviewSidebarTool | null>(null);
  const [activeTab, setActiveTab] = useState<WorkspaceTab>("summary");
  const [downloadFormat, setDownloadFormat] = useState<DownloadFormat>("txt");
  const [ticketFormatPreset, setTicketFormatPreset] = useState<TicketFormatPreset>("enterprise");
  const [settingsPanelTab, setSettingsPanelTab] = useState<SettingsPanelTab>("formats");
  const [actionViewFilter, setActionViewFilter] = useState<ActionViewFilter>("all");
  const [expandedActionId, setExpandedActionId] = useState<string | null>(null);
  const [jiraIssueTypes, setJiraIssueTypes] = useState<JiraIssueTypeCreateMeta[]>([]);
  const [jiraCreateMetaLoading, setJiraCreateMetaLoading] = useState(false);
  const chatViewportRef = useRef<HTMLDivElement | null>(null);
  const hasSeededChatRef = useRef(false);
  const previousChatMessageIdsRef = useRef<string[]>([]);
  const chatAudioContextRef = useRef<AudioContext | null>(null);
  const suppressNextChatSoundRef = useRef(false);
  const jiraLookupTimeoutsRef = useRef<Record<string, ReturnType<typeof setTimeout> | undefined>>({});
  const jiraConnectWindowRef = useRef<Window | null>(null);
  const jiraConnectPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const selectedTicketFormat =
    TICKET_FORMAT_PRESETS.find((preset) => preset.id === ticketFormatPreset) ?? TICKET_FORMAT_PRESETS[0];
  const executionHubTab = executionState.activeDestination;
  const jiraExecutionState = executionState.jira;
  const emailExecutionState = executionState.email;
  const jiraCloudId = jiraExecutionState.config.cloudId;
  const jiraProjectKey = jiraExecutionState.config.projectKey;
  const jiraTicketDetails = jiraExecutionState.config.ticketDetails;
  const jiraDynamicFieldValues = jiraExecutionState.config.dynamicFieldValues;
  const jiraLookupQueries = jiraExecutionState.config.lookupQueries;
  const jiraLookupResults = jiraExecutionState.config.lookupResults;
  const jiraLookupLoading = jiraExecutionState.config.lookupLoading;
  const emailRecipientMode = emailExecutionState.config.recipientMode;
  const emailCustomRecipients = emailExecutionState.config.customRecipients;
  const emailSubject = emailExecutionState.config.subject;
  const jiraLabels = jiraTicketDetails.labelsText
    .split(",")
    .map((label) => label.trim())
    .filter(Boolean);
  const jiraComponents = jiraTicketDetails.componentsText
    .split(",")
    .map((component) => component.trim())
    .filter(Boolean);
  const emailRecipients = emailCustomRecipients
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  const selectedJiraIssueType =
    jiraIssueTypes.find((issueType) => issueType.name === jiraTicketDetails.issueType || issueType.id === jiraTicketDetails.issueType) ?? null;
  const selectedJiraSite = jiraSites.find((site) => site.id === jiraCloudId) ?? null;
  const linkedActionCount = data?.actions.filter((action) => action.jiraIssueKey && action.jiraCloudId).length ?? 0;
  const allActionsAlreadyLinked = Boolean(data && data.actions.length > 0 && linkedActionCount === data.actions.length);
  const updateJiraConfig = (
    updater: (current: ExecutionState["jira"]["config"]) => ExecutionState["jira"]["config"],
  ) => {
    setExecutionState((current) => ({
      ...current,
      jira: {
        ...current.jira,
        config: updater(current.jira.config),
      },
    }));
  };
  const updateEmailConfig = (
    updater: (current: ExecutionState["email"]["config"]) => ExecutionState["email"]["config"],
  ) => {
    setExecutionState((current) => ({
      ...current,
      email: {
        ...current.email,
        config: updater(current.email.config),
      },
    }));
  };
  const jiraLoaderStep =
    jiraExecutionState.stage === "exporting" || jiraExecutionState.stage === "complete"
      ? 2
      : jiraExecutionState.stage === "blocked"
        ? 1
        : jiraExecutionState.stage === "scanning"
          ? 0
          : 0;
  const jiraDynamicFields = (selectedJiraIssueType?.fields ?? []).filter(
    (field) =>
      !["summary", "description", "issuetype", "project", "priority", "labels", "components", "environment", "duedate"].includes(field.key),
  );
  const platformSyncItems = [
    {
      name: "Jira",
      state: !jiraStatus?.configured ? ("not_connected" as const) : jiraStatus.connected ? ("connected" as const) : ("available" as const),
      detail: !jiraStatus?.configured
        ? "Set Jira OAuth in the API first."
        : jiraStatus.connected
          ? `${jiraSites.length} workspace${jiraSites.length === 1 ? "" : "s"} available for export.`
          : "Connect Jira to push approved actions into a project.",
    },
    {
      name: "Email",
      state: "connected" as const,
      detail:
        emailExecutionState.result?.createdCount && emailExecutionState.result.createdCount > 0
          ? `${emailExecutionState.result.createdCount} email log${emailExecutionState.result.createdCount === 1 ? "" : "s"} created from this meeting.`
          : "Send follow-up execution plans to attendees, owners, or custom recipients.",
    },
  ];
  const executionDestinationItems = [
    {
      name: "Jira Delivery",
      state: !jiraStatus?.configured ? "attention" : jiraStatus.connected ? "ready" : "attention",
      detail: !jiraStatus?.configured
            ? "Jira OAuth still needs API configuration."
            : jiraStatus.connected
              ? "Connected and ready for issue creation, project field mapping, and sync."
              : "Available once a Jira account is connected.",
      actionLabel: jiraStatus?.connected ? "Open Jira" : "Connect Jira",
      onAction: jiraStatus?.connected
        ? () => {
            setExecutionState((current) => ({ ...current, activeDestination: "jira" }));
            setJiraExportModalOpen(true);
          }
        : () => void handleConnectJira(),
    },
    {
      name: "Email Follow-Up",
      state: "ready" as const,
      detail: "Available now for structured action-plan follow-ups and handoff emails.",
      actionLabel: "Open Email",
      onAction: () => {
        setExecutionState((current) => ({ ...current, activeDestination: "email" }));
        setJiraExportModalOpen(true);
      },
    },
  ] as const;

  const renderExecutionPanel = () => {
    if (!data) return null;

    const actionCounts = {
      all: data.actions.length,
      open: data.actions.filter((item) => item.status === "open").length,
      in_progress: data.actions.filter((item) => item.status === "in_progress").length,
      done: data.actions.filter((item) => item.status === "done").length,
    } satisfies Record<ActionViewFilter, number>;
    const filteredActions =
      actionViewFilter === "all" ? data.actions : data.actions.filter((action) => action.status === actionViewFilter);

    return (
      <div className="space-y-6">
        {(!data.transcript?.text || data.meeting.status === "created" || data.meeting.status === "processing") && (
          <Card title="Processing Status" subtitle="Retry if AI processing failed or timed out">
            <Button variant="secondary" onClick={handleRetryProcessing} disabled={retryingProcess}>
              {retryingProcess ? "Retrying..." : "Retry Processing"}
            </Button>
          </Card>
        )}

        <Card title="Actions">
          <div className="space-y-3">
            {!data.meeting.actionsConfirmed && (
              <div className="rounded-xl border border-[rgba(108,242,255,0.35)] bg-[rgba(108,242,255,0.12)] p-3">
                <p className="text-sm font-semibold text-[var(--text-primary)]">Confirm Proposed Action Plan</p>
                <p className="mt-1 text-xs text-[var(--text-secondary)]">
                  Review the generated action list. Confirm to keep it, or use fallback to replace with a safe default task.
                </p>
                <div className="mt-3 flex gap-2">
                  <Button
                    variant="secondary"
                    onClick={() => void handleConfirmActions(true)}
                    disabled={Boolean(confirmingActions)}
                  >
                    {confirmingActions === "accept" ? "Confirming..." : "Confirm List"}
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => void handleConfirmActions(false)}
                    disabled={Boolean(confirmingActions)}
                  >
                    {confirmingActions === "fallback" ? "Applying..." : "Use Fallback"}
                  </Button>
                </div>
              </div>
            )}
            {data.actions.length === 0 && <p className="text-sm text-[var(--text-muted)]">No actions generated yet.</p>}
            {data.actions.length > 0 && (
              <div className="space-y-3">
                <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                  {(["all", "open", "in_progress", "done"] as ActionViewFilter[]).map((filter) => {
                    const isActive = actionViewFilter === filter;
                    return (
                      <button
                        key={filter}
                        type="button"
                        onClick={() => setActionViewFilter(filter)}
                        className={`rounded-xl border px-3 py-3 text-left transition ${
                          isActive
                            ? "border-[rgba(120,145,255,0.38)] bg-[rgba(120,145,255,0.14)] shadow-[0_18px_32px_-28px_rgba(120,145,255,0.9)]"
                            : "border-[rgba(120,145,255,0.16)] bg-[rgba(255,255,255,0.03)] hover:border-[rgba(120,145,255,0.3)]"
                        }`}
                      >
                        <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
                          {filter === "all" ? "General" : actionFilterLabel[filter]}
                        </p>
                        <p className="mt-2 text-lg font-bold text-[var(--text-primary)]">{actionCounts[filter]}</p>
                      </button>
                    );
                  })}
                </div>

                <div className="flex items-center justify-between gap-3 rounded-xl border border-[rgba(120,145,255,0.14)] bg-[rgba(255,255,255,0.03)] px-3 py-2">
                  <p className="text-sm text-[var(--text-secondary)]">
                    Showing <span className="font-semibold text-[var(--text-primary)]">{actionCounts[actionViewFilter]}</span>{" "}
                    {actionViewFilter === "all" ? "tickets" : `${actionFilterLabel[actionViewFilter].toLowerCase()} tickets`}
                  </p>
                  <button
                    type="button"
                    onClick={() => setExpandedActionId(null)}
                    className="text-xs font-medium text-[var(--text-secondary)] transition hover:text-[var(--text-primary)]"
                  >
                    Collapse all
                  </button>
                </div>
              </div>
            )}
            {filteredActions.map((action, index) => {
              const isExpanded = expandedActionId === action.id;

              return (
              <motion.article
                key={action.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.22, delay: index * 0.04 }}
                className="group relative overflow-hidden rounded-2xl border border-[rgba(120,145,255,0.24)] bg-[rgba(255,255,255,0.03)] p-3"
              >
                <div className="pointer-events-none absolute inset-y-0 left-0 w-1.5 bg-gradient-to-b from-[var(--accent)] via-[var(--accent-strong)] to-[var(--accent-warm)]" />
                <div className="pointer-events-none absolute -right-8 -top-8 h-20 w-20 rounded-full bg-[rgba(30,123,255,0.14)] blur-2xl transition group-hover:bg-[rgba(143,56,255,0.18)]" />

                <div className="ml-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="mb-2 flex items-center gap-2">
                        <span className="rounded-full border border-[rgba(120,145,255,0.28)] bg-[rgba(7,12,30,0.72)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-secondary)]">
                          Task {index + 1}
                        </span>
                        <span
                          className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] ${statusBadgeClass[action.status]}`}
                        >
                          {formatActionStatusLabel(action.status)}
                        </span>
                        <span
                          className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] ${priorityBadgeClass[action.priority]}`}
                        >
                          {formatActionPriorityLabel(action.priority)}
                        </span>
                      </div>
                      <p className="truncate pr-4 text-sm font-semibold leading-relaxed text-[var(--text-primary)]">{action.description}</p>
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-[var(--text-secondary)]">
                        <span>
                          Owner: <span className="font-semibold text-[var(--text-primary)]">{action.ownerEmail}</span>
                        </span>
                        {action.jiraIssueKey && action.jiraIssueUrl && (
                          <a
                            href={action.jiraIssueUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="rounded-full border border-[rgba(108,242,255,0.28)] bg-[rgba(108,242,255,0.1)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--accent)] transition hover:text-[var(--text-primary)]"
                          >
                            Jira {action.jiraIssueKey}
                          </a>
                        )}
                        <span
                          className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] ${jiraSyncBadgeClass[action.jiraSyncStatus]}`}
                          title={action.jiraSyncError || jiraSyncLabel[action.jiraSyncStatus]}
                        >
                          {jiraSyncLabel[action.jiraSyncStatus]}
                        </span>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => setExpandedActionId((current) => (current === action.id ? null : action.id))}
                      className="rounded-full border border-[var(--border)] bg-[rgba(255,255,255,0.04)] px-3 py-1.5 text-xs font-semibold text-[var(--text-secondary)] transition hover:text-[var(--text-primary)]"
                    >
                      {isExpanded ? "Hide" : "View"}
                    </button>
                  </div>

                  <AnimatePresence initial={false}>
                    {isExpanded && (
                      <motion.div
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -6 }}
                        transition={{ duration: 0.18, ease: "easeOut" }}
                        className="mt-3 rounded-2xl border border-[rgba(120,145,255,0.18)] bg-[rgba(7,12,30,0.5)] p-3"
                      >
                        <div className="mb-2 flex items-center justify-between gap-2">
                          <span className="rounded-full bg-[rgba(255,255,255,0.08)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-primary)]">
                            {Math.round(action.confidence * 100)}% confidence
                          </span>
                          <span className="text-xs text-[var(--text-secondary)]">
                            Due: <span className="font-semibold text-[var(--text-primary)]">{action.dueDate ? new Date(action.dueDate).toLocaleDateString() : "Not set"}</span>
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          {ACTION_STATUS_OPTIONS.map((option) => (
                            <button
                              key={`${action.id}-${option.value}`}
                              type="button"
                              onClick={() => void handleUpdateAction(action.id, { status: option.value })}
                              disabled={updatingActionId === action.id || action.status === option.value}
                              className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.06em] transition ${
                                action.status === option.value
                                  ? "border-[rgba(108,242,255,0.6)] bg-[rgba(108,242,255,0.18)] text-[var(--text-primary)]"
                                  : "border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                              } disabled:cursor-not-allowed disabled:opacity-60`}
                            >
                              {option.label}
                            </button>
                          ))}
                          <select
                            value={action.priority}
                            onChange={(event) =>
                              void handleUpdateAction(action.id, { priority: event.target.value as ActionPriority })
                            }
                            disabled={updatingActionId === action.id}
                            className="rounded-full border border-[var(--border)] bg-[rgba(7,12,30,0.8)] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--text-primary)] outline-none focus:border-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {ACTION_PRIORITY_OPTIONS.map((option) => (
                              <option key={`${action.id}-priority-${option.value}`} value={option.value}>
                                Priority: {option.label}
                              </option>
                            ))}
                          </select>
                          <Button
                            variant="secondary"
                            className="px-2.5 py-1 text-[11px] uppercase tracking-[0.06em]"
                            onClick={() => void handleUpdateAction(action.id, { status: "done" })}
                            disabled={updatingActionId === action.id || action.status === "done"}
                          >
                            Mark Done
                          </Button>
                          <Button
                            variant="ghost"
                            className="px-2.5 py-1 text-[11px] uppercase tracking-[0.06em] text-[var(--danger)] hover:text-[var(--danger)]"
                            onClick={() => void handleDeleteAction(action.id)}
                            disabled={deletingActionId === action.id}
                          >
                            {deletingActionId === action.id ? "Deleting..." : "Delete"}
                          </Button>
                          {action.jiraIssueKey && (
                            <Button
                              variant="ghost"
                              className="px-2.5 py-1 text-[11px] uppercase tracking-[0.06em]"
                              onClick={() => void handleResyncAction(action.id)}
                              disabled={resyncingActionId === action.id}
                            >
                              {resyncingActionId === action.id ? "Resyncing..." : "Resync Jira"}
                            </Button>
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </motion.article>
              );
            })}
          </div>
        </Card>

        <Card title="Approval" subtitle="Required before outbound actions">
          <Button
            onClick={handleApprove}
            disabled={approving || data.meeting.status !== "ready" || !data.meeting.actionsConfirmed}
            className={approving ? "glow-pulse" : ""}
          >
            {approving ? "Approving..." : "Approve Meeting"}
          </Button>
          <p className="mt-3 text-xs text-[var(--text-muted)]">
            {!data.meeting.actionsConfirmed
              ? "Confirm actions first, then approve."
              : "Approval logs email intents for summary and action distribution."}
          </p>
        </Card>
      </div>
    );
  };

  const playChatMessageTone = async (role: ChatMessage["role"], delayMs = 0) => {
    if (typeof window === "undefined") return;

    const AudioContextClass = window.AudioContext;
    if (!AudioContextClass) return;

    const startTone = () => {
      const context = chatAudioContextRef.current ?? new AudioContextClass();
      chatAudioContextRef.current = context;
      if (context.state === "suspended") {
        void context.resume();
      }

      const oscillator = context.createOscillator();
      const gainNode = context.createGain();
      oscillator.type = role === "assistant" ? "sine" : "triangle";
      oscillator.frequency.value = role === "assistant" ? 720 : 540;
      gainNode.gain.setValueAtTime(0.0001, context.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.045, context.currentTime + 0.01);
      gainNode.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.18);
      oscillator.connect(gainNode);
      gainNode.connect(context.destination);
      oscillator.start();
      oscillator.stop(context.currentTime + 0.2);
    };

    if (delayMs > 0) {
      window.setTimeout(startTone, delayMs);
      return;
    }

    startTone();
  };

  const playJiraExportCompleteTone = async () => {
    if (typeof window === "undefined") return;

    const AudioContextClass = window.AudioContext;
    if (!AudioContextClass) return;

    const context = chatAudioContextRef.current ?? new AudioContextClass();
    chatAudioContextRef.current = context;
    if (context.state === "suspended") {
      await context.resume();
    }

    const notes = [640, 820, 980];
    notes.forEach((frequency, index) => {
      const oscillator = context.createOscillator();
      const gainNode = context.createGain();
      const startAt = context.currentTime + index * 0.11;
      oscillator.type = "sine";
      oscillator.frequency.value = frequency;
      gainNode.gain.setValueAtTime(0.0001, startAt);
      gainNode.gain.exponentialRampToValueAtTime(0.055, startAt + 0.02);
      gainNode.gain.exponentialRampToValueAtTime(0.0001, startAt + 0.18);
      oscillator.connect(gainNode);
      gainNode.connect(context.destination);
      oscillator.start(startAt);
      oscillator.stop(startAt + 0.2);
    });
  };

  const renderExecutionProfileSelector = () => (
    <div className="space-y-3 rounded-2xl border border-[rgba(120,145,255,0.18)] bg-[rgba(7,12,30,0.36)] p-4">
      <div>
        <p className="text-sm font-semibold text-[var(--text-primary)]">Execution Profile</p>
        <p className="mt-1 text-xs text-[var(--text-secondary)]">
          Choose how OrbitPlan should shape the output for this destination.
        </p>
      </div>
      <div className="grid gap-3 xl:grid-cols-2">
        {STEP_FOUR_DELIVERY_OPTIONS.map((option) => {
          const isSelected = ticketFormatPreset === option.id;
          return (
            <button
              key={option.id}
              type="button"
              onClick={() => setTicketFormatPreset(option.id)}
              className={`w-full rounded-2xl border p-3 text-left transition ${option.accentClass} ${
                isSelected ? "shadow-[0_18px_34px_-28px_rgba(120,145,255,0.8)]" : ""
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-[var(--text-primary)]">{option.title}</p>
                  <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">{option.detail}</p>
                </div>
                <span
                  className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] ${
                    isSelected
                      ? "border-[rgba(56,255,179,0.34)] bg-[rgba(56,255,179,0.14)] text-[var(--success)]"
                      : "border-[rgba(120,145,255,0.2)] bg-[rgba(255,255,255,0.04)] text-[var(--text-muted)]"
                  }`}
                >
                  {isSelected ? "Active" : "Select"}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );

  const renderJiraExportContent = () => (
    <JiraExecutionPanel
      profileSelector={renderExecutionProfileSelector()}
      jiraStatus={jiraStatus}
      jiraConnectedNotice={jiraConnectedNotice}
      jiraStage={jiraExecutionState.stage}
      jiraExporting={jiraExecutionState.exporting}
      jiraLoaderStep={jiraLoaderStep}
      jiraCloudId={jiraCloudId}
      jiraProjectKey={jiraProjectKey}
      jiraSites={jiraSites}
      jiraProjects={jiraProjects}
      jiraLoading={jiraLoading}
      jiraIssueTypes={jiraIssueTypes}
      selectedJiraIssueType={selectedJiraIssueType}
      jiraTicketDetails={jiraTicketDetails}
      jiraCreateMetaLoading={jiraCreateMetaLoading}
      jiraDynamicFields={jiraDynamicFields}
      allActionsAlreadyLinked={allActionsAlreadyLinked}
      actionsConfirmed={Boolean(data?.meeting.actionsConfirmed)}
      hasActions={Boolean(data && data.actions.length > 0)}
      jiraScanResult={jiraExecutionState.scanResult}
      jiraResult={jiraExecutionState.result}
      loadingStates={JIRA_EXPORT_LOADING_STATES}
      renderDynamicJiraField={renderDynamicJiraField}
      onConnectJira={handleConnectJira}
      onRefreshJira={() => void loadJiraState()}
      onExportToJira={handleExportToJira}
      onCloudChange={(value) => updateJiraConfig((current) => ({ ...current, cloudId: value }))}
      onProjectChange={(value) => updateJiraConfig((current) => ({ ...current, projectKey: value }))}
      onIssueTypeChange={(value) =>
        updateJiraConfig((current) => ({
          ...current,
          ticketDetails: { ...current.ticketDetails, issueType: value },
        }))
      }
      onLabelsChange={(value) =>
        updateJiraConfig((current) => ({
          ...current,
          ticketDetails: { ...current.ticketDetails, labelsText: value },
        }))
      }
      onComponentsChange={(value) =>
        updateJiraConfig((current) => ({
          ...current,
          ticketDetails: { ...current.ticketDetails, componentsText: value },
        }))
      }
      onEnvironmentChange={(value) =>
        updateJiraConfig((current) => ({
          ...current,
          ticketDetails: { ...current.ticketDetails, environment: value },
        }))
      }
      onAdditionalContextChange={(value) =>
        updateJiraConfig((current) => ({
          ...current,
          ticketDetails: { ...current.ticketDetails, additionalContext: value },
        }))
      }
      onAdvancedFieldsChange={(value) =>
        updateJiraConfig((current) => ({
          ...current,
          ticketDetails: { ...current.ticketDetails, advancedFieldsJson: value },
        }))
      }
    />
  );

  const renderEmailExportContent = () => (
    <EmailExecutionPanel
      profileSelector={renderExecutionProfileSelector()}
      emailRecipientMode={emailRecipientMode}
      emailSubject={emailSubject}
      emailCustomRecipients={emailCustomRecipients}
      emailExporting={emailExecutionState.exporting}
      emailResult={emailExecutionState.result}
      selectedTicketFormatLabel={selectedTicketFormat.label}
      actionsConfirmed={Boolean(data?.meeting.actionsConfirmed)}
      hasActions={Boolean(data && data.actions.length > 0)}
      onRecipientModeChange={(value) => updateEmailConfig((current) => ({ ...current, recipientMode: value }))}
      onSubjectChange={(value) => updateEmailConfig((current) => ({ ...current, subject: value }))}
      onCustomRecipientsChange={(value) => updateEmailConfig((current) => ({ ...current, customRecipients: value }))}
      onExportToEmail={handleExportToEmail}
    />
  );

  const renderActionPlanFlowchart = () => {
    if (!data) return null;

    const jiraProjectUrl =
      selectedJiraSite && jiraProjectKey ? `${selectedJiraSite.url.replace(/\/$/, "")}/projects/${jiraProjectKey}` : null;
    const workflowSteps = [
      {
        key: "captured",
        label: "Meeting Captured",
        detail: `${data.actions.length} action${data.actions.length === 1 ? "" : "s"} identified`,
        isComplete: true,
      },
      {
        key: "confirmed",
        label: "Action Plan Confirmed",
        detail: data.meeting.actionsConfirmed ? "Confirmed" : "Pending confirmation",
        isComplete: data.meeting.actionsConfirmed,
      },
      {
        key: "approved",
        label: "Ready For Approval",
        detail: data.meeting.status === "approved" ? "Approved" : data.meeting.status === "ready" ? "Awaiting approval" : "Still in review",
        isComplete: data.meeting.status === "approved",
      },
      {
        key: "delivery",
        label: "Execution Destination",
        detail:
          executionHubTab === "jira"
            ? jiraCloudId && jiraProjectKey
              ? `Jira configured with ${selectedTicketFormat.label}`
              : "Open the execution hub to configure Jira or Email delivery"
            : `Email configured with ${selectedTicketFormat.label}`,
        isComplete: executionHubTab === "jira" ? Boolean(jiraCloudId && jiraProjectKey) : Boolean(emailExecutionState.result?.createdCount),
      },
    ];

    return (
      <Card title="Action Plan Flow" subtitle="Visual map of the current delivery path">
        <div className="space-y-6">
          <div className="grid gap-3 xl:grid-cols-4">
            {workflowSteps.map((step, index) => (
              <div
                key={step.key}
                className={`relative rounded-[24px] border p-4 ${
                  step.key === "delivery" && jiraExecutionState.stage === "complete"
                    ? "border-[rgba(56,255,179,0.3)] bg-[linear-gradient(135deg,rgba(56,255,179,0.12)_0%,rgba(30,123,255,0.12)_100%)] shadow-[0_20px_42px_-30px_rgba(56,255,179,0.7)]"
                    : "border-[rgba(120,145,255,0.18)] bg-[rgba(255,255,255,0.03)]"
                }`}
              >
                {index < workflowSteps.length - 1 && (
                  <div className="pointer-events-none absolute right-[-18px] top-1/2 hidden h-px w-9 -translate-y-1/2 bg-[linear-gradient(90deg,rgba(120,145,255,0.45)_0%,rgba(120,145,255,0)_100%)] xl:block" />
                )}
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">Step {index + 1}</p>
                    <p className="mt-2 text-base font-semibold text-[var(--text-primary)]">{step.label}</p>
                  </div>
                  <span
                    className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.1em] ${
                      step.key === "delivery" && jiraExecutionState.stage === "complete"
                        ? "border-[rgba(56,255,179,0.36)] bg-[rgba(56,255,179,0.16)] text-[var(--success)]"
                        : step.isComplete
                          ? "border-[rgba(56,255,179,0.34)] bg-[rgba(56,255,179,0.12)] text-[var(--success)]"
                          : "border-[rgba(120,145,255,0.18)] bg-[rgba(255,255,255,0.05)] text-[var(--text-muted)]"
                    }`}
                  >
                    {step.key === "delivery" && jiraExecutionState.stage === "complete" ? "Exported" : step.isComplete ? "Active" : "Pending"}
                  </span>
                </div>
                <p className="mt-3 text-sm text-[var(--text-secondary)]">{step.detail}</p>
                {step.key === "delivery" && (
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setJiraExportModalOpen(true)}
                      className={`inline-flex rounded-full border px-3 py-1.5 text-xs font-semibold transition hover:text-[var(--text-primary)] ${
                        jiraExecutionState.stage === "complete"
                          ? "border-[rgba(56,255,179,0.34)] bg-[rgba(56,255,179,0.14)] text-[var(--success)]"
                          : "border-[rgba(108,242,255,0.28)] bg-[rgba(108,242,255,0.1)] text-[var(--accent)]"
                      }`}
                    >
                      {jiraExecutionState.stage === "complete" && executionHubTab === "jira" ? `View ${selectedTicketFormat.label}` : "Open Execution Hub"}
                    </button>
                    {jiraProjectUrl && (
                      <a
                        href={jiraProjectUrl}
                        target="_blank"
                        rel="noreferrer"
                        className={`inline-flex rounded-full border px-3 py-1.5 text-xs font-semibold transition hover:text-[var(--text-primary)] ${
                          jiraExecutionState.stage === "complete"
                            ? "border-[rgba(56,255,179,0.28)] bg-[rgba(56,255,179,0.1)] text-[var(--success)]"
                            : "border-[rgba(120,145,255,0.2)] bg-[rgba(255,255,255,0.04)] text-[var(--text-secondary)]"
                        }`}
                      >
                        {jiraExecutionState.stage === "complete" ? "Open Exported Jira Project" : "Open Jira Project"}
                      </a>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="rounded-[26px] border border-[rgba(120,145,255,0.18)] bg-[linear-gradient(180deg,rgba(9,14,36,0.82)_0%,rgba(7,11,28,0.9)_100%)] p-4 sm:p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">Execution Sequence</p>
                <p className="mt-2 text-lg font-semibold text-[var(--text-primary)]">Action-by-action flow</p>
              </div>
              <span className="rounded-full border border-[rgba(120,145,255,0.18)] bg-[rgba(255,255,255,0.04)] px-3 py-1 text-xs font-medium text-[var(--text-secondary)]">
                Ordered by current plan sequence
              </span>
            </div>

            {data.actions.length === 0 ? (
              <div className="mt-4 rounded-2xl border border-dashed border-[rgba(120,145,255,0.18)] bg-[rgba(255,255,255,0.02)] p-6 text-sm text-[var(--text-secondary)]">
                No actions generated yet.
              </div>
            ) : (
              <div className="mt-5 overflow-x-auto pb-2">
                <div className="flex min-w-max items-stretch gap-4">
                  {data.actions.map((action, index) => (
                    <div key={action.id} className="flex items-center gap-4">
                      <div className="w-[280px] rounded-[24px] border border-[rgba(120,145,255,0.18)] bg-[rgba(255,255,255,0.04)] p-4 shadow-[0_20px_40px_-30px_rgba(0,0,0,0.9)]">
                        <div className="flex items-start justify-between gap-3">
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border border-[rgba(120,145,255,0.2)] bg-[rgba(7,12,30,0.72)] text-sm font-semibold text-[var(--text-primary)]">
                            {index + 1}
                          </span>
                          <div className="flex flex-wrap justify-end gap-2">
                            <span className={`rounded-full border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] ${statusBadgeClass[action.status]}`}>
                              {formatActionStatusLabel(action.status)}
                            </span>
                            <span className={`rounded-full border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] ${priorityBadgeClass[action.priority]}`}>
                              {formatActionPriorityLabel(action.priority)}
                            </span>
                          </div>
                        </div>

                        <p className="mt-4 text-sm font-semibold leading-6 text-[var(--text-primary)]">{action.description}</p>

                        <div className="mt-4 space-y-2 text-xs text-[var(--text-secondary)]">
                          <p>
                            <span className="font-semibold text-[var(--text-primary)]">Owner:</span> {action.ownerEmail || "Unassigned"}
                          </p>
                          <p>
                            <span className="font-semibold text-[var(--text-primary)]">Due:</span>{" "}
                            {action.dueDate ? new Date(action.dueDate).toLocaleDateString() : "Not set"}
                          </p>
                          <p>
                            <span className="font-semibold text-[var(--text-primary)]">Jira:</span> {jiraSyncLabel[action.jiraSyncStatus]}
                          </p>
                        </div>

                        {action.jiraIssueUrl && (
                          <a
                            href={action.jiraIssueUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="mt-4 inline-flex rounded-full border border-[rgba(108,242,255,0.28)] bg-[rgba(108,242,255,0.1)] px-3 py-1.5 text-xs font-semibold text-[var(--accent)] transition hover:text-[var(--text-primary)]"
                          >
                            Open Jira Ticket
                          </a>
                        )}
                      </div>

                      {index < data.actions.length - 1 && (
                        <div className="flex shrink-0 items-center gap-2 text-[var(--text-muted)]">
                          <div className="h-px w-8 bg-[linear-gradient(90deg,rgba(120,145,255,0.45)_0%,rgba(120,145,255,0.12)_100%)]" />
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
                            <path d="M5 12h14" />
                            <path d="m13 6 6 6-6 6" />
                          </svg>
                          <div className="h-px w-8 bg-[linear-gradient(90deg,rgba(120,145,255,0.12)_0%,rgba(120,145,255,0.45)_100%)]" />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </Card>
    );
  };

  const renderIntegrationsPanel = () => (
    <div className="space-y-6">
      <Card title="Execution Destinations" subtitle="Manage where OrbitPlan can send work after the meeting is ready">
        <div className="grid gap-3">
          {executionDestinationItems.map((destination) => {
            const meta = executionDestinationStateMeta[destination.state];

            return (
              <div
                key={destination.name}
                className="flex items-start justify-between gap-3 rounded-2xl border border-[rgba(120,145,255,0.16)] bg-[linear-gradient(135deg,rgba(255,255,255,0.045)_0%,rgba(255,255,255,0.02)_100%)] p-4"
              >
                <div>
                  <p className="text-sm font-semibold text-[var(--text-primary)]">{destination.name}</p>
                  <p className="mt-1 text-xs text-[var(--text-secondary)]">{destination.detail}</p>
                  <p className="mt-2 text-[11px] text-[var(--text-muted)]">{meta.description}</p>
                </div>
                <div className="flex items-center gap-2">
                  <StatusPill label={meta.label} tone={meta.tone} />
                  <button
                    type="button"
                    onClick={destination.onAction}
                    className="inline-flex items-center gap-2 rounded-full border border-[rgba(108,242,255,0.28)] bg-[rgba(108,242,255,0.1)] px-3 py-1.5 text-xs font-semibold text-[var(--accent)] transition hover:border-[rgba(108,242,255,0.44)] hover:bg-[rgba(108,242,255,0.16)] hover:text-[var(--text-primary)]"
                  >
                    {destination.actionLabel}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      <Card title="Platform Sync" subtitle="Connection status for integrations OrbitPlan uses behind the scenes">
        <div className="grid gap-3">
          {platformSyncItems.map((platform) => {
            const meta = platformStateMeta[platform.state];

            return (
              <div
                key={platform.name}
                className="flex items-start justify-between gap-3 rounded-2xl border border-[rgba(120,145,255,0.16)] bg-[linear-gradient(135deg,rgba(255,255,255,0.045)_0%,rgba(255,255,255,0.02)_100%)] p-4"
              >
                <div>
                  <p className="text-sm font-semibold text-[var(--text-primary)]">{platform.name}</p>
                  <p className="mt-1 text-xs text-[var(--text-secondary)]">{platform.detail}</p>
                  <p className="mt-2 text-[11px] text-[var(--text-muted)]">{meta.description}</p>
                </div>
                <div className="flex items-center gap-2">
                  <StatusPill label={meta.label} tone={meta.tone} />
                  {platform.name === "Jira" && platform.state === "available" && (
                    <button
                      type="button"
                      onClick={handleConnectJira}
                      className="inline-flex items-center gap-2 rounded-full border border-[rgba(56,255,179,0.3)] bg-[rgba(56,255,179,0.12)] px-3 py-1.5 text-xs font-semibold text-[var(--success)] transition hover:border-[rgba(56,255,179,0.46)] hover:bg-[rgba(56,255,179,0.18)] hover:text-[var(--text-primary)]"
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" className="h-3.5 w-3.5">
                        <path d="M12 5v14" />
                        <path d="M5 12h14" />
                      </svg>
                      Sync
                    </button>
                  )}
                  {platform.name === "Jira" && platform.state === "connected" && (
                    <button
                      type="button"
                      onClick={() => void handleDisconnectJira()}
                      disabled={jiraDisconnecting}
                      className="inline-flex items-center gap-2 rounded-full border border-[rgba(255,107,122,0.28)] bg-[rgba(255,107,122,0.1)] px-3 py-1.5 text-xs font-semibold text-[var(--danger)] transition hover:border-[rgba(255,107,122,0.44)] hover:bg-[rgba(255,107,122,0.16)] hover:text-[var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" className="h-3.5 w-3.5">
                        <path d="M5 12h14" />
                      </svg>
                      {jiraDisconnecting ? "Unsyncing..." : "Unsync"}
                    </button>
                  )}
                  {platform.name === "Email" && (
                    <button
                      type="button"
                      onClick={() => {
                        setExecutionState((current) => ({ ...current, activeDestination: "email" }));
                        setJiraExportModalOpen(true);
                      }}
                      className="inline-flex items-center gap-2 rounded-full border border-[rgba(120,145,255,0.24)] bg-[rgba(255,255,255,0.04)] px-3 py-1.5 text-xs font-semibold text-[var(--text-secondary)] transition hover:border-[rgba(120,145,255,0.4)] hover:text-[var(--text-primary)]"
                    >
                      Open
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );

  const renderApprovalPanel = () => {
    if (!data) return null;

    return (
      <Card title="Approval" subtitle="Meeting readiness and final approval controls">
        <div className="space-y-4 text-sm text-[var(--text-secondary)]">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-strong)] p-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">Meeting Status</p>
              <p className="mt-2 text-sm font-semibold text-[var(--text-primary)]">{data.meeting.status}</p>
            </div>
            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-strong)] p-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">Actions Confirmed</p>
              <p className="mt-2 text-sm font-semibold text-[var(--text-primary)]">
                {data.meeting.actionsConfirmed ? "Confirmed" : "Pending"}
              </p>
            </div>
          </div>

          <Button
            onClick={handleApprove}
            disabled={approving || data.meeting.status !== "ready" || !data.meeting.actionsConfirmed}
            className={approving ? "glow-pulse" : ""}
          >
            {approving ? "Approving..." : "Approve Meeting"}
          </Button>
          <p className="text-xs text-[var(--text-muted)]">
            {!data.meeting.actionsConfirmed
              ? "Confirm actions before approval."
              : "Approval unlocks outbound execution and keeps the activity log auditable."}
          </p>
        </div>
      </Card>
    );
  };

  const renderTranscriptPanel = () => {
    if (!data) return null;

    return (
      <Card
        title="Transcript"
        subtitle="Expanded transcript view with export options"
        rightSlot={
          <div className="flex items-center gap-2">
            <select
              value={downloadFormat}
              onChange={(event) => setDownloadFormat(event.target.value as DownloadFormat)}
              className="rounded-lg border border-[var(--border)] bg-[var(--surface-strong)] px-2 py-1.5 text-xs font-semibold uppercase tracking-[0.06em] text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
            >
              <option value="txt">TXT</option>
              <option value="csv">CSV</option>
              <option value="pdf">PDF</option>
              <option value="docx">DOCX</option>
            </select>
            <Button variant="secondary" onClick={() => void handleDownloadTranscript()} disabled={!data.transcript?.text}>
              Download
            </Button>
          </div>
        }
      >
        <p className="max-h-[60vh] overflow-auto whitespace-pre-wrap rounded-xl bg-[var(--surface-strong)] p-4 text-sm text-[var(--text-secondary)]">
          {data.transcript?.text ?? "No transcript"}
        </p>
      </Card>
    );
  };

  const renderSummaryPanel = () => (
    <Card title="Summary" subtitle="Decisions, risks, and notes in one place">
      <div className="grid gap-4 text-sm text-[var(--text-secondary)]">
        <p>
          <strong className="text-[var(--text-primary)]">Decisions:</strong> {data?.summary?.decisions ?? "-"}
        </p>
        <p>
          <strong className="text-[var(--text-primary)]">Risks:</strong> {data?.summary?.risks ?? "-"}
        </p>
        <p>
          <strong className="text-[var(--text-primary)]">Notes:</strong> {data?.summary?.notes ?? "-"}
        </p>
      </div>
    </Card>
  );

  const renderChatPanel = () => (
    <Card title="Chat" subtitle="Ask questions about this meeting without leaving review mode">
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          {chatHasMore ? (
            <Button variant="ghost" onClick={handleLoadOlderMessages} disabled={chatHistoryLoading}>
              {chatHistoryLoading ? "Loading older..." : "Load Older Messages"}
            </Button>
          ) : (
            <span className="text-xs text-[var(--text-muted)]">Latest conversation loaded</span>
          )}
          <Button variant="ghost" onClick={() => setConfirmClearOpen(true)} disabled={chatClearing}>
            {chatClearing ? "Clearing..." : "Clear Chat"}
          </Button>
        </div>

        <AnimatePresence>
          {confirmClearOpen && (
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              className="rounded-xl border border-[rgba(255,107,122,0.35)] bg-[rgba(255,107,122,0.1)] p-3"
            >
              <p className="text-sm font-medium text-[var(--text-primary)]">Clear this meeting chat history?</p>
              <p className="mt-1 text-xs text-[var(--text-secondary)]">This removes all saved messages for this meeting.</p>
              <div className="mt-3 flex gap-2">
                <Button variant="secondary" onClick={handleClearChat} disabled={chatClearing}>
                  {chatClearing ? "Clearing..." : "Yes, Clear"}
                </Button>
                <Button variant="ghost" onClick={() => setConfirmClearOpen(false)} disabled={chatClearing}>
                  Cancel
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div ref={chatViewportRef} className="relative max-h-[52vh] space-y-2 overflow-auto rounded-xl border border-[var(--border)] bg-[rgba(6,10,26,0.96)] p-3">
          <div className="pointer-events-none absolute inset-0 opacity-70">
            <div className="absolute -top-10 right-6 h-28 w-28 rounded-full bg-[rgba(143,56,255,0.2)] blur-2xl" />
            <div className="absolute -bottom-8 left-5 h-24 w-24 rounded-full bg-[rgba(30,123,255,0.2)] blur-2xl" />
          </div>
          <div className="relative z-10 space-y-2">
            {chatMessages.length === 0 && (
              <p className="text-xs text-[var(--text-muted)]">
                Try: &quot;What decisions were made?&quot;, &quot;Who owns onboarding?&quot;, &quot;What are blockers?&quot;
              </p>
            )}
            <AnimatePresence initial={false}>
              {chatMessages.map((message) => (
                <ChatConversationBubble key={message.id} message={message} />
              ))}
              {chatLoading && <ChatTypingIndicator key="typing-indicator" />}
            </AnimatePresence>
          </div>
        </div>

        <div className="flex gap-2">
          <input
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            onKeyDown={handleQuestionKeyDown}
            placeholder="Ask about decisions, owners, risks, deadlines..."
            className="flex-1 rounded-xl border border-[var(--border)] bg-[var(--surface-strong)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
          />
          <Button onClick={handleAsk} disabled={chatLoading || !question.trim()}>
            {chatLoading ? "Asking..." : "Ask"}
          </Button>
        </div>
      </div>
    </Card>
  );

  const renderTicketsPanel = () => (
    <Card title="Tickets" subtitle="Created issues and export state">
      <div className="space-y-4 text-sm text-[var(--text-secondary)]">
        <div className="rounded-xl border border-[rgba(120,145,255,0.24)] bg-[linear-gradient(135deg,rgba(30,123,255,0.12)_0%,rgba(143,56,255,0.08)_60%,rgba(255,180,0,0.06)_100%)] p-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">Active Ticket Format</p>
          <div className="mt-2 flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-[var(--text-primary)]">{selectedTicketFormat.label}</p>
              <p className="mt-1 text-xs text-[var(--text-secondary)]">{selectedTicketFormat.description}</p>
            </div>
            <span className="rounded-full border border-[rgba(120,145,255,0.24)] bg-[rgba(255,255,255,0.04)] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-primary)]">
              Active
            </span>
          </div>
        </div>
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-strong)] p-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">Ticket Field Profile</p>
          <div className="mt-2 grid gap-3 md:grid-cols-2">
            <div>
              <p className="text-xs text-[var(--text-muted)]">Issue type</p>
              <p className="text-sm font-semibold text-[var(--text-primary)]">{jiraTicketDetails.issueType || "Task"}</p>
            </div>
            <div>
              <p className="text-xs text-[var(--text-muted)]">Labels</p>
              <p className="text-sm font-semibold text-[var(--text-primary)]">{jiraLabels.join(", ") || "None"}</p>
            </div>
            <div>
              <p className="text-xs text-[var(--text-muted)]">Components</p>
              <p className="text-sm font-semibold text-[var(--text-primary)]">{jiraComponents.join(", ") || "None"}</p>
            </div>
            <div>
              <p className="text-xs text-[var(--text-muted)]">Advanced fields</p>
              <p className="text-sm font-semibold text-[var(--text-primary)]">
                {jiraTicketDetails.advancedFieldsJson.trim() ? "Configured" : "None"}
              </p>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-strong)] p-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">Connected</p>
            <p className="mt-2 text-sm font-semibold text-[var(--text-primary)]">{jiraStatus?.connected ? "Jira ready" : "Not connected"}</p>
          </div>
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-strong)] p-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">Created Tickets</p>
              <p className="mt-2 text-sm font-semibold text-[var(--text-primary)]">{jiraExecutionState.result?.createdCount ?? 0}</p>
          </div>
        </div>
        {jiraExecutionState.result?.issues.length ? (
          <div className="space-y-2">
            {jiraExecutionState.result.issues.map((issue) => (
              <a
                key={issue.key}
                href={issue.url}
                target="_blank"
                rel="noreferrer"
                className="block rounded-xl border border-[var(--border)] bg-[var(--surface-strong)] p-3 text-[var(--accent)] hover:underline"
              >
                {issue.key}
              </a>
            ))}
          </div>
        ) : (
          <p>No exported tickets yet. Use Destinations to connect Jira and export confirmed actions.</p>
        )}
      </div>
    </Card>
  );

  const renderPeoplePanel = () => {
    const owners = Array.from(new Set((data?.actions ?? []).map((action) => action.ownerEmail)));
    const attendees = data?.meeting.attendees ?? [];

    return (
      <Card title="People" subtitle="Attendees, owners, and responsible people">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">Attendees</p>
            {attendees.length === 0 && <p className="text-sm text-[var(--text-secondary)]">No attendees listed.</p>}
            {attendees.map((person) => (
              <div key={person} className="rounded-xl border border-[var(--border)] bg-[var(--surface-strong)] p-3 text-sm text-[var(--text-primary)]">
                {person}
              </div>
            ))}
          </div>
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">Action Owners</p>
            {owners.length === 0 && <p className="text-sm text-[var(--text-secondary)]">No owners assigned yet.</p>}
            {owners.map((person) => (
              <div key={person} className="rounded-xl border border-[var(--border)] bg-[var(--surface-strong)] p-3 text-sm text-[var(--text-primary)]">
                {person}
              </div>
            ))}
          </div>
        </div>
      </Card>
    );
  };

  const renderFilesPanel = () => (
    <Card title="Files" subtitle="Uploaded files and generated artifacts">
      <div className="space-y-3 text-sm text-[var(--text-secondary)]">
        {(data?.files.length ?? 0) === 0 && <p>No uploaded files recorded.</p>}
        {data?.files.map((file) => (
          <div key={file.id} className="rounded-xl border border-[var(--border)] bg-[var(--surface-strong)] p-3">
            <p className="font-semibold text-[var(--text-primary)]">{file.originalName}</p>
            <p>{file.mimeType}</p>
            <p>{Math.round(file.size / 1024)} KB</p>
          </div>
        ))}
        {data?.transcript && (
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-strong)] p-3">
            <p className="font-semibold text-[var(--text-primary)]">Generated transcript</p>
            <p>Available for TXT, CSV, PDF, and DOCX export.</p>
          </div>
        )}
      </div>
    </Card>
  );

  const renderTimelinePanel = () => {
    const timelineItems = [
      { label: "Meeting created", done: true, detail: new Date(data?.meeting.createdAt ?? "").toLocaleString() },
      { label: "File uploaded", done: Boolean(data?.files.length), detail: data?.files[0] ? data.files[0].originalName : "Waiting for upload" },
      { label: "Transcript processed", done: Boolean(data?.transcript), detail: data?.transcript ? "Transcript ready" : "Not processed yet" },
      { label: "Actions confirmed", done: Boolean(data?.meeting.actionsConfirmed), detail: data?.meeting.actionsConfirmed ? "Confirmed" : "Pending confirmation" },
      { label: "Meeting approved", done: data?.meeting.status === "approved", detail: data?.meeting.status === "approved" ? "Approved" : "Not approved yet" },
      {
        label: "Tickets exported",
        done: Boolean(jiraExecutionState.result?.issues.length),
        detail: jiraExecutionState.result?.issues.length ? `${jiraExecutionState.result.issues.length} issues created` : "No export yet",
      },
    ];

    return (
      <Card title="Timeline" subtitle="Lifecycle of this meeting and delivery flow">
        <div className="space-y-3">
          {timelineItems.map((item) => (
            <div key={item.label} className="flex items-start gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface-strong)] p-3">
              <div className={`mt-0.5 h-3 w-3 rounded-full ${item.done ? "bg-[var(--success)]" : "bg-[var(--text-muted)]"}`} />
              <div>
                <p className="text-sm font-semibold text-[var(--text-primary)]">{item.label}</p>
                <p className="text-xs text-[var(--text-secondary)]">{item.detail}</p>
              </div>
            </div>
          ))}
        </div>
      </Card>
    );
  };

  const renderNotificationsPanel = () => {
    if (!data) return null;

    return (
      <div className="space-y-6">
        <Card title="Notifications" subtitle="Logs, pending actions, and delivery alerts">
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-strong)] p-3">
              <p className="text-[10px] uppercase tracking-[0.08em] text-[var(--text-muted)]">Pending</p>
              <p className="mt-2 text-lg font-semibold text-[var(--text-primary)]">
                {data.actions.filter((item) => item.status !== "done").length}
              </p>
            </div>
            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-strong)] p-3">
              <p className="text-[10px] uppercase tracking-[0.08em] text-[var(--text-muted)]">Emails</p>
              <p className="mt-2 text-lg font-semibold text-[var(--text-primary)]">{data.emailLogs.length}</p>
            </div>
            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-strong)] p-3">
              <p className="text-[10px] uppercase tracking-[0.08em] text-[var(--text-muted)]">Alerts</p>
              <p className="mt-2 text-lg font-semibold text-[var(--text-primary)]">{error ? 1 : 0}</p>
            </div>
          </div>
          {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
        </Card>

        <Card title="Email Logs" subtitle="Outbound activity generated from approvals and workflows">
          <ul className="space-y-2 text-sm text-[var(--text-secondary)]">
            {data.emailLogs.length === 0 && <li>No email logs yet</li>}
            {data.emailLogs.map((log) => (
              <li key={log.id} className="rounded-xl border border-[var(--border)] bg-[var(--surface-strong)] p-3">
                <p className="font-semibold text-[var(--text-primary)]">{log.type.toUpperCase()}</p>
                <p>{log.recipient}</p>
                <p>{new Date(log.sentAt).toLocaleString()}</p>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    );
  };

  const renderSettingsPanel = () => {
    const settingsTabs: Array<{
      id: SettingsPanelTab;
      label: string;
      eyebrow: string;
    }> = [
      {
        id: "formats",
        label: "Formats",
        eyebrow: "Templates",
      },
      {
        id: "export-target",
        label: "Export Target",
        eyebrow: "Destination",
      },
      {
        id: "project",
        label: "Project",
        eyebrow: "Routing",
      },
      {
        id: "fields",
        label: "Fields",
        eyebrow: "Payload",
      },
      {
        id: "automation",
        label: "Automation",
        eyebrow: "Workflow",
      },
    ];

    const renderSettingsContent = () => {
      switch (settingsPanelTab) {
        case "export-target":
          return (
            <div className="rounded-[28px] border border-[var(--border)] bg-[var(--surface-strong)] p-6">
              <p className="text-lg font-semibold text-[var(--text-primary)]">Default Export Target</p>
              <p className="mt-3 text-lg font-semibold text-[var(--text-primary)]">
                {jiraStatus?.connected ? "Jira connected and available" : "No export target connected yet"}
              </p>
              <p className="mt-2 text-sm text-[var(--text-secondary)]">
                Ticket exports currently route through Jira when the integration is connected and a project is selected.
              </p>
            </div>
          );
        case "project":
          return (
            <div className="rounded-[28px] border border-[var(--border)] bg-[var(--surface-strong)] p-6">
              <p className="text-lg font-semibold text-[var(--text-primary)]">Preferred Project</p>
              <p className="mt-3 text-lg font-semibold text-[var(--text-primary)]">{jiraProjectKey || "No Jira project selected yet"}</p>
              <p className="mt-2 text-sm text-[var(--text-secondary)]">
                Pick a Jira site and project from the Destinations area. This setting reflects the current meeting target.
              </p>
            </div>
          );
        case "fields":
          return (
            <div className="rounded-[28px] border border-[rgba(120,145,255,0.24)] bg-[linear-gradient(135deg,rgba(30,123,255,0.08)_0%,rgba(143,56,255,0.08)_60%,rgba(255,180,0,0.05)_100%)] p-6">
              <p className="text-2xl font-semibold text-[var(--text-primary)]">Jira field mapping moved</p>
              <p className="mt-3 text-sm text-[var(--text-secondary)]">
                Jira export fields now live directly inside the `Action Plan Flow` export section so setup and submission happen in one place.
              </p>
            </div>
          );
        case "automation":
          return (
            <div className="rounded-[28px] border border-[var(--border)] bg-[var(--surface-strong)] p-6">
              <p className="text-lg font-semibold text-[var(--text-primary)]">Automation Toggles</p>
              <p className="mt-3 text-lg font-semibold text-[var(--text-primary)]">Not wired yet</p>
              <p className="mt-2 text-sm text-[var(--text-secondary)]">
                Meeting-level automation controls are not wired yet in this workspace, but this tab leaves space for those defaults.
              </p>
            </div>
          );
        case "formats":
        default:
          return (
            <div className="rounded-[28px] border border-[rgba(120,145,255,0.24)] bg-[linear-gradient(135deg,rgba(30,123,255,0.1)_0%,rgba(143,56,255,0.08)_58%,rgba(255,180,0,0.05)_100%)] p-6">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-2xl font-semibold text-[var(--text-primary)]">Ticket creation presets</p>
                  <p className="mt-1 text-sm text-[var(--text-secondary)]">
                    Choose how tickets should be structured when this meeting exports actions into Jira.
                  </p>
                </div>
              </div>

              <div className="mt-4 grid gap-3 xl:grid-cols-2 2xl:grid-cols-3">
                {TICKET_FORMAT_PRESETS.map((preset) => {
                  const isSelected = ticketFormatPreset === preset.id;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => setTicketFormatPreset(preset.id)}
                      className={`rounded-2xl border p-3 text-left transition ${
                        isSelected
                          ? "border-[rgba(56,255,179,0.42)] bg-[rgba(56,255,179,0.12)] shadow-[0_16px_30px_-24px_rgba(56,255,179,0.8)]"
                          : "border-[rgba(120,145,255,0.2)] bg-[rgba(7,12,30,0.45)] hover:border-[rgba(120,145,255,0.36)]"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-[var(--text-primary)]">{preset.label}</p>
                          <p className="mt-1 text-xs text-[var(--text-secondary)]">{preset.description}</p>
                        </div>
                        <span
                          className={`rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] ${
                            isSelected
                              ? "border border-[rgba(56,255,179,0.32)] bg-[rgba(56,255,179,0.14)] text-[var(--success)]"
                              : "border border-[rgba(120,145,255,0.2)] bg-[rgba(255,255,255,0.04)] text-[var(--text-muted)]"
                          }`}
                        >
                          {isSelected ? "Selected" : "Preset"}
                        </span>
                      </div>

                      <div className="mt-3 flex flex-wrap gap-2">
                        {preset.sections.map((section) => (
                          <span
                            key={section}
                            className="rounded-full border border-[rgba(120,145,255,0.18)] bg-[rgba(255,255,255,0.04)] px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.06em] text-[var(--text-secondary)]"
                          >
                            {section}
                          </span>
                        ))}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          );
      }
    };

    const activeTab = settingsTabs.find((tab) => tab.id === settingsPanelTab) ?? settingsTabs[0];

    return (
      <Card title="Settings" subtitle="Meeting-level working defaults">
        <div className="grid gap-6 xl:grid-cols-[280px_minmax(0,1fr)]">
          <aside className="rounded-[30px] border border-[rgba(120,145,255,0.16)] bg-[linear-gradient(180deg,rgba(10,16,34,0.92)_0%,rgba(8,12,26,0.88)_100%)] p-4">
            <div className="border-b border-[rgba(120,145,255,0.12)] px-2 pb-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">Workspace Settings</p>
              <p className="mt-2 text-lg font-semibold text-[var(--text-primary)]">Export configuration</p>
            </div>

            <nav className="mt-4 space-y-2">
              {settingsTabs.map((tab) => {
                const isActive = settingsPanelTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setSettingsPanelTab(tab.id)}
                    className={`w-full rounded-[22px] border px-4 py-4 text-left transition ${
                      isActive
                        ? "border-[rgba(120,145,255,0.22)] bg-[linear-gradient(135deg,rgba(56,255,179,0.14)_0%,rgba(120,145,255,0.14)_100%)] shadow-[0_20px_36px_-28px_rgba(56,255,179,0.55)]"
                        : "border-transparent bg-transparent hover:border-[rgba(120,145,255,0.14)] hover:bg-[rgba(255,255,255,0.035)]"
                    }`}
                  >
                    <p className="text-xs font-medium tracking-[0.08em] text-[var(--text-muted)]">{tab.eyebrow}</p>
                    <div className="mt-2 flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-base font-semibold text-[var(--text-primary)]">{tab.label}</p>
                      </div>
                      <span
                        className={`mt-0.5 h-2.5 w-2.5 rounded-full ${
                          isActive ? "bg-[var(--success)] shadow-[0_0_0_4px_rgba(56,255,179,0.12)]" : "bg-[rgba(120,145,255,0.24)]"
                        }`}
                      />
                    </div>
                  </button>
                );
              })}
            </nav>
          </aside>

          <div className="min-w-0 rounded-[30px] border border-[rgba(120,145,255,0.16)] bg-[rgba(255,255,255,0.025)] p-4 sm:p-5 xl:p-6">
            <div className="border-b border-[rgba(120,145,255,0.12)] pb-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">{activeTab.eyebrow}</p>
              <p className="mt-2 text-2xl font-semibold text-[var(--text-primary)]">{activeTab.label}</p>
            </div>

            <div className="min-w-0 pt-5">{renderSettingsContent()}</div>
          </div>
        </div>
      </Card>
    );
  };

  useEffect(() => {
    let isMounted = true;

    const fetchMeeting = async () => {
      try {
        const meeting = await getMeeting(id);
        const history = await getMeetingChatHistory(id, { limit: CHAT_PAGE_SIZE });
        if (isMounted) {
          setData(meeting);
          if (history.messages.length > 0) {
            setChatMessages(history.messages);
            setChatCursor(history.nextBefore);
            setChatHasMore(Boolean(history.nextBefore));
            hasSeededChatRef.current = true;
          } else {
            setChatMessages([]);
            setChatCursor(null);
            setChatHasMore(false);
          }
        }
      } catch (requestError) {
        if (isMounted) setError(requestError instanceof Error ? requestError.message : "Failed to load meeting");
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    void fetchMeeting();

    return () => {
      isMounted = false;
    };
  }, [id]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const storedValue = window.localStorage.getItem(`orbitplan:ticket-format:${id}`);
    if (!storedValue) return;
    if (TICKET_FORMAT_PRESETS.some((preset) => preset.id === storedValue)) {
      setTicketFormatPreset(storedValue as TicketFormatPreset);
    }
  }, [id]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(`orbitplan:ticket-format:${id}`, ticketFormatPreset);
  }, [id, ticketFormatPreset]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const storedValue = window.localStorage.getItem(`orbitplan:jira-ticket-details:${id}`);
    if (!storedValue) return;
    try {
      const parsed = JSON.parse(storedValue) as Partial<JiraTicketDetailsDraft & { dynamicFieldValues?: JiraDynamicFieldValues }>;
      updateJiraConfig((current) => ({
        ...current,
        ticketDetails: {
          issueType: parsed.issueType?.trim() || DEFAULT_JIRA_TICKET_DETAILS.issueType,
          labelsText: parsed.labelsText ?? DEFAULT_JIRA_TICKET_DETAILS.labelsText,
          componentsText: parsed.componentsText ?? DEFAULT_JIRA_TICKET_DETAILS.componentsText,
          environment: parsed.environment ?? DEFAULT_JIRA_TICKET_DETAILS.environment,
          additionalContext: parsed.additionalContext ?? DEFAULT_JIRA_TICKET_DETAILS.additionalContext,
          advancedFieldsJson: parsed.advancedFieldsJson ?? DEFAULT_JIRA_TICKET_DETAILS.advancedFieldsJson,
        },
        dynamicFieldValues: parsed.dynamicFieldValues ?? {},
      }));
    } catch {
      window.localStorage.removeItem(`orbitplan:jira-ticket-details:${id}`);
    }
  }, [id]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(
      `orbitplan:jira-ticket-details:${id}`,
      JSON.stringify({
        ...jiraTicketDetails,
        dynamicFieldValues: jiraDynamicFieldValues,
      }),
    );
  }, [id, jiraDynamicFieldValues, jiraTicketDetails]);

  const loadJiraState = async () => {
    setJiraLoading(true);
    try {
      const status = await getJiraStatus();
      setJiraStatus(status);

      if (!status.connected) {
        setJiraSites([]);
        setJiraProjects([]);
        updateJiraConfig((current) => ({
          ...current,
          cloudId: "",
          projectKey: "",
        }));
        return;
      }

      const sites = await getJiraSites();
      setJiraSites(sites);
      const selectedCloudId = jiraCloudId && sites.some((site) => site.id === jiraCloudId) ? jiraCloudId : (sites[0]?.id ?? "");

      if (selectedCloudId) {
        const projects = await getJiraProjects(selectedCloudId);
        setJiraProjects(projects);
        const selectedProjectKey =
          jiraProjectKey && projects.some((project) => project.key === jiraProjectKey) ? jiraProjectKey : (projects[0]?.key ?? "");
        updateJiraConfig((current) => ({
          ...current,
          cloudId: selectedCloudId,
          projectKey: selectedProjectKey,
        }));
      } else {
        setJiraProjects([]);
        updateJiraConfig((current) => ({
          ...current,
          cloudId: "",
          projectKey: "",
        }));
      }
    } catch (jiraError) {
      setError(jiraError instanceof Error ? jiraError.message : "Failed to load Jira integration");
    } finally {
      setJiraLoading(false);
    }
  };

  useEffect(() => {
    void loadJiraState();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!jiraStatus?.connected || !jiraCloudId) return;
    let isMounted = true;

    const loadProjects = async () => {
      try {
        const projects = await getJiraProjects(jiraCloudId);
        if (!isMounted) return;
        setJiraProjects(projects);
        updateJiraConfig((current) => ({
          ...current,
          projectKey: projects[0]?.key ?? "",
        }));
      } catch (jiraError) {
        if (isMounted) setError(jiraError instanceof Error ? jiraError.message : "Failed to load Jira projects");
      }
    };

    void loadProjects();
    return () => {
      isMounted = false;
    };
  }, [jiraCloudId, jiraStatus?.connected]);

  useEffect(() => {
    if (!jiraStatus?.connected || !jiraCloudId || !jiraProjectKey) {
      setJiraIssueTypes([]);
      return;
    }

    let isMounted = true;
    const loadCreateMeta = async () => {
      setJiraCreateMetaLoading(true);
      try {
        const issueTypes = await getJiraCreateMeta(jiraCloudId, jiraProjectKey);
        if (!isMounted) return;
        setJiraIssueTypes(issueTypes);
        if (!issueTypes.some((issueType) => issueType.name === jiraTicketDetails.issueType || issueType.id === jiraTicketDetails.issueType)) {
          const fallback = issueTypes[0]?.name ?? "Task";
          updateJiraConfig((current) => ({
            ...current,
            ticketDetails: {
              ...current.ticketDetails,
              issueType: fallback,
            },
          }));
        }
      } catch (jiraMetaError) {
        if (isMounted) setError(jiraMetaError instanceof Error ? jiraMetaError.message : "Failed to load Jira field metadata");
      } finally {
        if (isMounted) setJiraCreateMetaLoading(false);
      }
    };

    void loadCreateMeta();
    return () => {
      isMounted = false;
    };
  }, [jiraCloudId, jiraProjectKey, jiraStatus?.connected, jiraTicketDetails.issueType]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type !== "orbitplan:jira-connected") return;
      setJiraConnectedNotice(true);
      if (jiraConnectPollRef.current) {
        window.clearInterval(jiraConnectPollRef.current);
        jiraConnectPollRef.current = null;
      }
      jiraConnectWindowRef.current = null;
      void loadJiraState();
    };

    window.addEventListener("message", handleMessage);
    return () => {
      if (jiraConnectPollRef.current) {
        window.clearInterval(jiraConnectPollRef.current);
        jiraConnectPollRef.current = null;
      }
      window.removeEventListener("message", handleMessage);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (activeTab !== "chat") return;
    if (!hasSeededChatRef.current && chatMessages.length === 0) {
      hasSeededChatRef.current = true;
      void playChatMessageTone("assistant");
      setChatMessages([
        {
          id: `a-welcome-${Date.now()}`,
          role: "assistant",
          text: "Hi, I am OrbitBot. How can I assist you with this meeting? You can ask about decisions, owners, risks, timelines, next steps, or ask me to translate transcript content.",
          createdAt: new Date().toISOString(),
        },
      ]);
      return;
    }
    const viewport = chatViewportRef.current;
    if (!viewport) return;
    const id = window.requestAnimationFrame(() => {
      viewport.scrollTo({ top: viewport.scrollHeight, behavior: "smooth" });
    });
    return () => window.cancelAnimationFrame(id);
  }, [chatMessages, chatLoading, activeTab]);

  useEffect(() => {
    const previousIds = previousChatMessageIdsRef.current;
    const previousSet = new Set(previousIds);
    const newMessages = chatMessages.filter((message) => !previousSet.has(message.id));

    if (previousIds.length > 0 && activeTab === "chat" && newMessages.length > 0) {
      if (suppressNextChatSoundRef.current) {
        suppressNextChatSoundRef.current = false;
      } else {
        newMessages.forEach((message, index) => {
          void playChatMessageTone(message.role, index * 120);
        });
      }
    }

    previousChatMessageIdsRef.current = chatMessages.map((message) => message.id);
  }, [chatMessages, activeTab]);

  const handleApprove = async () => {
    if (!data) return;
    setApproving(true);
    setError(null);
    try {
      const nextData = await approveMeeting(data.meeting.id);
      setData(nextData);
    } catch (approveError) {
      setError(approveError instanceof Error ? approveError.message : "Approval failed");
    } finally {
      setApproving(false);
    }
  };

  const handleAsk = async () => {
    if (!data || !question.trim()) return;
    const q = question.trim();
    setQuestion("");
    setChatLoading(true);
    setError(null);

    try {
      const response = await askMeetingQuestion(data.meeting.id, q);
      if (response.messages && response.messages.length > 0) {
        setChatMessages((prev) => [...prev, ...response.messages]);
      } else {
        const fallbackMessages: ChatMessage[] = [
          {
            id: `u-${Date.now()}`,
            role: "user",
            text: q,
            createdAt: new Date().toISOString(),
          },
          {
            id: `a-${Date.now()}`,
            role: "assistant",
            text: response.answer,
            citations: response.citations,
            createdAt: new Date().toISOString(),
          },
        ];
        setChatMessages((prev) => [...prev, ...fallbackMessages]);
      }
    } catch (chatError) {
      setError(chatError instanceof Error ? chatError.message : "Meeting chat failed");
    } finally {
      setChatLoading(false);
    }
  };

  const handleQuestionKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter" || event.shiftKey) return;
    event.preventDefault();
    void handleAsk();
  };

  const handleLoadOlderMessages = async () => {
    if (!data || !chatCursor || chatHistoryLoading) return;
    setChatHistoryLoading(true);
    setError(null);
    try {
      suppressNextChatSoundRef.current = true;
      const history = await getMeetingChatHistory(data.meeting.id, {
        limit: CHAT_PAGE_SIZE,
        before: chatCursor,
      });
      setChatMessages((prev) => [...history.messages, ...prev]);
      setChatCursor(history.nextBefore);
      setChatHasMore(Boolean(history.nextBefore));
    } catch (historyError) {
      setError(historyError instanceof Error ? historyError.message : "Failed to load chat history");
    } finally {
      setChatHistoryLoading(false);
    }
  };

  const handleClearChat = async () => {
    if (!data || chatClearing) return;
    setChatClearing(true);
    setError(null);
    try {
      await clearMeetingChatHistory(data.meeting.id);
      setChatMessages([]);
      setChatCursor(null);
      setChatHasMore(false);
      hasSeededChatRef.current = false;
      setConfirmClearOpen(false);
    } catch (clearError) {
      setError(clearError instanceof Error ? clearError.message : "Failed to clear chat");
    } finally {
      setChatClearing(false);
    }
  };

  const handleRetryProcessing = async () => {
    if (!data) return;
    setError(null);
    setRetryingProcess(true);
    try {
      const updated = await processMeeting(data.meeting.id);
      setData(updated);
    } catch (retryError) {
      setError(getProcessingErrorMessage(retryError));
    } finally {
      setRetryingProcess(false);
    }
  };

  const handleUpdateAction = async (
    actionId: string,
    patch: { status?: ActionStatus; priority?: ActionPriority },
  ) => {
    if (!data || updatingActionId) return;
    setUpdatingActionId(actionId);
    setError(null);
    try {
      const updated = await updateMeetingAction(data.meeting.id, actionId, patch);
      setData(updated);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Failed to update action");
    } finally {
      setUpdatingActionId(null);
    }
  };

  const handleDeleteAction = async (actionId: string) => {
    if (!data || deletingActionId) return;
    setDeletingActionId(actionId);
    setError(null);
    try {
      const updated = await deleteMeetingAction(data.meeting.id, actionId);
      setData(updated);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Failed to delete action");
    } finally {
      setDeletingActionId(null);
    }
  };

  const handleConnectJira = async () => {
    try {
      const url = await getJiraAuthUrl();
      const popup = window.open(url, "orbitplan-jira-connect", "popup=yes,width=720,height=760");
      if (!popup) {
        window.location.href = url;
        return;
      }

      jiraConnectWindowRef.current = popup;
      popup.focus();

      if (jiraConnectPollRef.current) {
        window.clearInterval(jiraConnectPollRef.current);
      }

      jiraConnectPollRef.current = window.setInterval(() => {
        const connectWindow = jiraConnectWindowRef.current;
        if (!connectWindow || connectWindow.closed) {
          if (jiraConnectPollRef.current) {
            window.clearInterval(jiraConnectPollRef.current);
            jiraConnectPollRef.current = null;
          }
          jiraConnectWindowRef.current = null;
          void loadJiraState();
        }
      }, 700);
    } catch (jiraError) {
      setError(jiraError instanceof Error ? jiraError.message : "Failed to start Jira connection");
    }
  };

  const handleDisconnectJira = async () => {
    setJiraDisconnecting(true);
    setError(null);
    try {
      await disconnectJira();
      setJiraProjects([]);
      setJiraSites([]);
      setJiraStatus((current) => (current ? { ...current, connected: false } : current));
      updateJiraConfig((current) => ({
        ...current,
        cloudId: "",
        projectKey: "",
      }));
      await loadJiraState();
    } catch (disconnectError) {
      setError(disconnectError instanceof Error ? disconnectError.message : "Failed to disconnect Jira");
    } finally {
      setJiraDisconnecting(false);
    }
  };

  const handleResyncAction = async (actionId: string) => {
    if (!data || resyncingActionId) return;
    setResyncingActionId(actionId);
    setError(null);
    try {
      const updated = await resyncMeetingAction(data.meeting.id, actionId);
      setData(updated);
    } catch (resyncError) {
      setError(resyncError instanceof Error ? resyncError.message : "Failed to resync Jira action");
    } finally {
      setResyncingActionId(null);
    }
  };

  const setDynamicFieldValue = (fieldKey: string, value: string | string[]) => {
    updateJiraConfig((current) => ({
      ...current,
      dynamicFieldValues: {
        ...current.dynamicFieldValues,
        [fieldKey]: value,
      },
    }));
  };

  const isUserPickerField = (field: JiraCreateFieldMeta) =>
    field.schemaType === "user" || field.custom?.toLowerCase().includes("userpicker");
  const isTeamLikeField = (field: JiraCreateFieldMeta) =>
    field.custom?.toLowerCase().includes("team") || field.custom?.toLowerCase().includes("sd-customerorganization");
  const isCascadingSelectField = (field: JiraCreateFieldMeta) => field.custom?.toLowerCase().includes("cascadingselect");
  const isVersionLikeField = (field: JiraCreateFieldMeta) =>
    field.schemaType === "version" || field.itemsType === "version" || field.custom?.toLowerCase().includes("version");
  const isSprintLikeField = (field: JiraCreateFieldMeta) => field.custom?.toLowerCase().includes("sprint");
  const isEpicLikeField = (field: JiraCreateFieldMeta) =>
    field.custom?.toLowerCase().includes("epic") || field.name.toLowerCase().includes("epic");
  const isOptionArrayField = (field: JiraCreateFieldMeta) => field.schemaType === "array" && Boolean(field.allowedValues?.length);

  const mapOptionValue = (field: JiraCreateFieldMeta, selected: string) => {
    const option = field.allowedValues?.find((allowed) => allowed.id === selected || allowed.label === selected);
    const optionId = option?.id ?? selected;

    if (isUserPickerField(field)) return { accountId: optionId };
    if (isTeamLikeField(field)) return { id: optionId };
    if (isVersionLikeField(field)) return { id: optionId };
    return { id: optionId };
  };

  const getFieldPlaceholder = (field: JiraCreateFieldMeta) => {
    if (isSprintLikeField(field)) return "Sprint name or ID";
    if (isEpicLikeField(field)) return "Epic key or ID";
    if (isUserPickerField(field)) return "Assignee or reporter";
    if (isTeamLikeField(field)) return "Team or organization";
    if (field.schemaType === "number") return "0";
    if (field.schemaType === "date") return "YYYY-MM-DD";
    return `Enter ${field.name.toLowerCase()}`;
  };

  const getLookupKind = (field: JiraCreateFieldMeta): "user" | "issue" | "epic" | "sprint" | null => {
    if (isUserPickerField(field)) return "user";
    if (isSprintLikeField(field)) return "sprint";
    if (isEpicLikeField(field)) return "epic";
    if (field.schemaType === "issuelinks" || field.schemaType === "issue") return "issue";
    return null;
  };

  const loadJiraLookupResults = (field: JiraCreateFieldMeta, query: string) => {
    const kind = getLookupKind(field);
    if (!kind || !jiraCloudId || !jiraProjectKey || query.trim().length < 2) {
      updateJiraConfig((current) => ({
        ...current,
        lookupResults: {
          ...current.lookupResults,
          [field.key]: [],
        },
      }));
      return;
    }

    if (jiraLookupTimeoutsRef.current[field.key]) {
      clearTimeout(jiraLookupTimeoutsRef.current[field.key]);
    }

    jiraLookupTimeoutsRef.current[field.key] = setTimeout(() => {
      void (async () => {
        updateJiraConfig((current) => ({
          ...current,
          lookupLoading: {
            ...current.lookupLoading,
            [field.key]: true,
          },
        }));
        try {
          const items = await getJiraLookup(jiraCloudId, jiraProjectKey, kind, query.trim());
          updateJiraConfig((current) => ({
            ...current,
            lookupResults: {
              ...current.lookupResults,
              [field.key]: items,
            },
          }));
        } catch (lookupError) {
          setError(lookupError instanceof Error ? lookupError.message : "Failed to load Jira lookup results");
        } finally {
          updateJiraConfig((current) => ({
            ...current,
            lookupLoading: {
              ...current.lookupLoading,
              [field.key]: false,
            },
          }));
        }
      })();
    }, 250);
  };

  const buildDynamicJiraFields = () => {
    const dynamicFields: Record<string, unknown> = {};

    for (const field of jiraDynamicFields) {
      const rawValue = jiraDynamicFieldValues[field.key];
      if (rawValue == null || rawValue === "" || (Array.isArray(rawValue) && rawValue.length === 0)) continue;

      if (isCascadingSelectField(field)) {
        const [parentId, childId] = String(rawValue).split("::");
        if (parentId) {
          dynamicFields[field.key] = {
            id: parentId,
            ...(childId ? { child: { id: childId } } : {}),
          };
        }
        continue;
      }

      if (field.allowedValues && field.allowedValues.length > 0) {
        if (isOptionArrayField(field)) {
          const selectedValues = Array.isArray(rawValue) ? rawValue : String(rawValue).split(",").map((item) => item.trim()).filter(Boolean);
          dynamicFields[field.key] = selectedValues.map((selected) => mapOptionValue(field, selected));
          continue;
        }

        dynamicFields[field.key] = mapOptionValue(field, String(rawValue));
        continue;
      }

      if (isUserPickerField(field)) {
        dynamicFields[field.key] = { accountId: String(rawValue) };
        continue;
      }

      if (isTeamLikeField(field) || isVersionLikeField(field) || isSprintLikeField(field) || isEpicLikeField(field)) {
        dynamicFields[field.key] = { id: String(rawValue) };
        continue;
      }

      if (field.schemaType === "number") {
        const parsed = Number(rawValue);
        if (!Number.isNaN(parsed)) dynamicFields[field.key] = parsed;
        continue;
      }

      if (field.schemaType === "array") {
        dynamicFields[field.key] = Array.isArray(rawValue)
          ? rawValue
          : String(rawValue)
              .split(",")
              .map((item) => item.trim())
              .filter(Boolean);
        continue;
      }

      dynamicFields[field.key] = rawValue;
    }

    return dynamicFields;
  };

  const renderDynamicJiraField = (field: JiraCreateFieldMeta) => {
    const value = jiraDynamicFieldValues[field.key];

    if (isCascadingSelectField(field) && field.allowedValues && field.allowedValues.length > 0) {
      const [selectedParent = "", selectedChild = ""] = typeof value === "string" ? value.split("::") : ["", ""];
      const childOptions = field.allowedValues.find((option) => option.id === selectedParent)?.children ?? [];

      return (
        <div key={field.key} className="grid gap-3">
          <label className="block space-y-2">
            <span className="text-sm font-medium text-[var(--text-secondary)]">
              {field.name} {field.required ? "*" : ""}
            </span>
            <select
              value={selectedParent}
              onChange={(event) => setDynamicFieldValue(field.key, event.target.value)}
              className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface-strong)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
            >
              <option value="">Select {field.name}</option>
              {field.allowedValues.map((option) => (
                <option key={`${field.key}-${option.id}`} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          {childOptions.length > 0 && (
            <label className="block space-y-2">
              <span className="text-sm font-medium text-[var(--text-secondary)]">Child Option</span>
              <select
                value={selectedChild}
                onChange={(event) => setDynamicFieldValue(field.key, `${selectedParent}::${event.target.value}`)}
                className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface-strong)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
              >
                <option value="">Select child option</option>
                {childOptions.map((option) => (
                  <option key={`${field.key}-${selectedParent}-${option.id}`} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      );
    }

    if (field.allowedValues && field.allowedValues.length > 0) {
      if (isOptionArrayField(field)) {
        const selectedValues = Array.isArray(value) ? value : [];
        return (
          <label key={field.key} className="block space-y-2">
            <span className="text-sm font-medium text-[var(--text-secondary)]">
              {field.name} {field.required ? "*" : ""}
            </span>
            <select
              multiple
              value={selectedValues}
              onChange={(event) =>
                setDynamicFieldValue(
                  field.key,
                  Array.from(event.target.selectedOptions).map((option) => option.value),
                )
              }
              className="min-h-32 w-full rounded-xl border border-[var(--border)] bg-[var(--surface-strong)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
            >
              {field.allowedValues.map((option) => (
                <option key={`${field.key}-${option.id}`} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        );
      }

      return (
        <label key={field.key} className="block space-y-2">
          <span className="text-sm font-medium text-[var(--text-secondary)]">
            {field.name} {field.required ? "*" : ""}
          </span>
          <select
            value={typeof value === "string" ? value : ""}
            onChange={(event) => setDynamicFieldValue(field.key, event.target.value)}
            className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface-strong)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
          >
            <option value="">Select {field.name}</option>
            {field.allowedValues.map((option) => (
              <option key={`${field.key}-${option.id}`} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      );
    }

    if (field.schemaType === "number") {
      return (
        <label key={field.key} className="block space-y-2">
          <span className="text-sm font-medium text-[var(--text-secondary)]">
            {field.name} {field.required ? "*" : ""}
          </span>
          <input
            type="number"
            value={typeof value === "string" ? value : ""}
            onChange={(event) => setDynamicFieldValue(field.key, event.target.value)}
            placeholder={getFieldPlaceholder(field)}
            className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface-strong)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
          />
        </label>
      );
    }

    if (field.schemaType === "date") {
      return (
        <label key={field.key} className="block space-y-2">
          <span className="text-sm font-medium text-[var(--text-secondary)]">
            {field.name} {field.required ? "*" : ""}
          </span>
          <input
            type="date"
            value={typeof value === "string" ? value : ""}
            onChange={(event) => setDynamicFieldValue(field.key, event.target.value)}
            placeholder={getFieldPlaceholder(field)}
            className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface-strong)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
          />
        </label>
      );
    }

    const lookupKind = getLookupKind(field);
    if (lookupKind) {
      const queryValue = jiraLookupQueries[field.key] ?? (typeof value === "string" ? value : "");
      const results = jiraLookupResults[field.key] ?? [];
      const isLoading = Boolean(jiraLookupLoading[field.key]);

      return (
        <div key={field.key} className="space-y-2">
          <label className="block space-y-2">
            <span className="text-sm font-medium text-[var(--text-secondary)]">
              {field.name} {field.required ? "*" : ""}
            </span>
            <input
              value={queryValue}
              onChange={(event) => {
                const nextValue = event.target.value;
                updateJiraConfig((current) => ({
                  ...current,
                  lookupQueries: {
                    ...current.lookupQueries,
                    [field.key]: nextValue,
                  },
                }));
                setDynamicFieldValue(field.key, nextValue);
                loadJiraLookupResults(field, nextValue);
              }}
              placeholder={getFieldPlaceholder(field)}
              className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface-strong)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
            />
          </label>
          {(isLoading || results.length > 0) && (
            <div className="rounded-xl border border-[rgba(120,145,255,0.18)] bg-[rgba(7,12,30,0.5)] p-2">
              {isLoading && <p className="text-xs text-[var(--text-secondary)]">Searching Jira...</p>}
              {!isLoading && results.length > 0 && (
                <div className="space-y-1">
                  {results.map((item) => (
                    <button
                      key={`${field.key}-${item.id}`}
                      type="button"
                      onClick={() => {
                        setDynamicFieldValue(field.key, item.id);
                        updateJiraConfig((current) => ({
                          ...current,
                          lookupQueries: {
                            ...current.lookupQueries,
                            [field.key]: item.label,
                          },
                          lookupResults: {
                            ...current.lookupResults,
                            [field.key]: [],
                          },
                        }));
                      }}
                      className="w-full rounded-lg border border-transparent px-3 py-2 text-left transition hover:border-[rgba(120,145,255,0.2)] hover:bg-[rgba(255,255,255,0.04)]"
                    >
                      <p className="text-sm font-semibold text-[var(--text-primary)]">{item.label}</p>
                      {item.secondary && <p className="text-xs text-[var(--text-secondary)]">{item.secondary}</p>}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      );
    }

    return (
      <label key={field.key} className="block space-y-2">
        <span className="text-sm font-medium text-[var(--text-secondary)]">
          {field.name} {field.required ? "*" : ""}
        </span>
        <input
          value={typeof value === "string" ? value : ""}
          onChange={(event) => setDynamicFieldValue(field.key, event.target.value)}
          placeholder={getFieldPlaceholder(field)}
          className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface-strong)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
        />
      </label>
    );
  };

  const handleExportToJira = async () => {
    if (!data || !jiraCloudId || !jiraProjectKey) return;
    setExecutionState((current) => ({
      ...current,
      jira: {
        ...current.jira,
        exporting: true,
        stage: "scanning",
        result: null,
        scanResult: null,
      },
    }));
    setError(null);
    try {
      let advancedFields: Record<string, unknown> | undefined;
      if (jiraTicketDetails.advancedFieldsJson.trim()) {
        const parsed = JSON.parse(jiraTicketDetails.advancedFieldsJson) as unknown;
        if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") {
          throw new Error("Advanced Jira fields must be a JSON object.");
        }
        advancedFields = parsed as Record<string, unknown>;
      }
      const dynamicFields = buildDynamicJiraFields();
      const exportPayload = {
        meetingId: data.meeting.id,
        cloudId: jiraCloudId,
        projectKey: jiraProjectKey,
        ticketFormatPreset,
        ticketDetails: {
          issueType: jiraTicketDetails.issueType.trim() || "Task",
          labels: jiraLabels,
          components: jiraComponents,
          environment: jiraTicketDetails.environment.trim() || undefined,
          additionalContext: jiraTicketDetails.additionalContext.trim() || undefined,
          advancedFields: {
            ...dynamicFields,
            ...(advancedFields ?? {}),
          },
        },
      };

      const scan = await scanMeetingToJira(exportPayload);
      setExecutionState((current) => ({
        ...current,
        jira: {
          ...current.jira,
          scanResult: scan,
        },
      }));
      if (scan.blockedCount > 0) {
        setExecutionState((current) => ({
          ...current,
          jira: {
            ...current.jira,
            exporting: false,
            stage: "blocked",
          },
        }));
        setError(`Export blocked. ${scan.blockedCount} ticket${scan.blockedCount === 1 ? "" : "s"} need review before Jira creation.`);
        return;
      }

      setExecutionState((current) => ({
        ...current,
        jira: {
          ...current.jira,
          stage: "exporting",
        },
      }));
      const result = await exportMeetingToJira(exportPayload);
      setExecutionState((current) => ({
        ...current,
        jira: {
          ...current.jira,
          exporting: false,
          stage: "complete",
          result,
        },
      }));
      setData(await getMeeting(data.meeting.id));
      void playJiraExportCompleteTone();
    } catch (jiraError) {
      setExecutionState((current) => ({
        ...current,
        jira: {
          ...current.jira,
          exporting: false,
          stage: "idle",
        },
      }));
      setError(jiraError instanceof Error ? jiraError.message : "Failed to export to Jira");
    }
  };

  const handleExportToEmail = async () => {
    if (!data) return;
    setExecutionState((current) => ({
      ...current,
      email: {
        ...current.email,
        exporting: true,
        stage: "exporting",
        result: null,
      },
    }));
    setError(null);
    try {
      const result = await exportMeetingToEmail({
        meetingId: data.meeting.id,
        ticketFormatPreset,
        recipientMode: emailRecipientMode,
        recipients: emailRecipientMode === "custom" ? emailRecipients : undefined,
        subject: emailSubject.trim() || undefined,
      });
      setExecutionState((current) => ({
        ...current,
        email: {
          ...current.email,
          exporting: false,
          stage: "complete",
          result,
        },
      }));
      setData(await getMeeting(data.meeting.id));
      void playJiraExportCompleteTone();
    } catch (emailError) {
      setExecutionState((current) => ({
        ...current,
        email: {
          ...current.email,
          exporting: false,
          stage: "idle",
        },
      }));
      setError(emailError instanceof Error ? emailError.message : "Failed to export to email");
    }
  };

  const handleConfirmActions = async (confirmed: boolean) => {
    if (!data || confirmingActions) return;
    setConfirmingActions(confirmed ? "accept" : "fallback");
    setError(null);
    try {
      const updated = await confirmMeetingActions(data.meeting.id, confirmed);
      setData(updated);
    } catch (confirmError) {
      setError(confirmError instanceof Error ? confirmError.message : "Failed to confirm action plan");
    } finally {
      setConfirmingActions(null);
    }
  };

  const handleDownloadTranscript = async () => {
    if (!data?.transcript?.text) return;

    const safeTitle = data.meeting.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 50);
    const fallbackTitle = safeTitle || "meeting";
    const createdAt = new Date(data.meeting.createdAt).toLocaleString();
    const attendees = data.meeting.attendees.join(", ");

    let content = "";
    let mimeType = "text/plain;charset=utf-8";

    if (downloadFormat === "pdf") {
      const doc = new jsPDF({ unit: "pt", format: "a4" });
      const margin = 44;
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const maxWidth = pageWidth - margin * 2;
      const lineHeight = 16;
      let y = margin;

      doc.setFont("helvetica", "bold");
      doc.setFontSize(14);
      doc.text(data.meeting.title, margin, y);
      y += lineHeight * 1.5;

      doc.setFont("helvetica", "normal");
      doc.setFontSize(11);
      doc.text(`Created: ${createdAt}`, margin, y);
      y += lineHeight;
      doc.text(`Attendees: ${attendees || "none"}`, margin, y);
      y += lineHeight * 1.5;
      doc.setFont("helvetica", "bold");
      doc.text("Transcript", margin, y);
      y += lineHeight;
      doc.setFont("helvetica", "normal");

      const lines = doc.splitTextToSize(data.transcript.text, maxWidth) as string[];
      for (const line of lines) {
        if (y > pageHeight - margin) {
          doc.addPage();
          y = margin;
        }
        doc.text(line, margin, y);
        y += lineHeight;
      }

      doc.save(`${fallbackTitle}-transcript.pdf`);
      return;
    } else if (downloadFormat === "docx") {
      const document = new Document({
        sections: [
          {
            children: [
              new Paragraph({
                children: [new TextRun({ text: data.meeting.title, bold: true, size: 30 })],
              }),
              new Paragraph({ children: [new TextRun(`Created: ${createdAt}`)] }),
              new Paragraph({ children: [new TextRun(`Attendees: ${attendees || "none"}`)] }),
              new Paragraph({ children: [new TextRun("")] }),
              new Paragraph({
                children: [new TextRun({ text: "Transcript", bold: true, size: 24 })],
              }),
              ...data.transcript.text.split("\n").map((line) => new Paragraph({ children: [new TextRun(line)] })),
            ],
          },
        ],
      });

      const blob = await Packer.toBlob(document);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${fallbackTitle}-transcript.docx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      return;
    } else if (downloadFormat === "csv") {
      const escapedTranscript = data.transcript.text.replace(/"/g, '""').replace(/\n/g, "\\n");
      content = `meeting_id,title,created_at,attendees,transcript\n"${data.meeting.id}","${data.meeting.title.replace(/"/g, '""')}","${data.meeting.createdAt}","${attendees.replace(/"/g, '""')}","${escapedTranscript}"\n`;
      mimeType = "text/csv;charset=utf-8";
    } else {
      content = `Title: ${data.meeting.title}\nCreated: ${createdAt}\nAttendees: ${attendees || "none"}\n\nTranscript\n${data.transcript.text}\n`;
    }

    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${fallbackTitle}-transcript.${downloadFormat}`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const sidebarTools: Array<{
    id: ReviewSidebarTool;
    title: string;
    icon: ReactNode;
    activeClass: string;
    idleClass: string;
    modalTitle: string;
    modalSubtitle: string;
    modalWidth?: string;
  }> = [
    {
      id: "integrations",
      title: "Destinations",
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" className="h-5 w-5">
          <path d="M7 7h10v10H7z" />
          <path d="M4 12h3" />
          <path d="M17 12h3" />
          <path d="M12 4v3" />
          <path d="M12 17v3" />
        </svg>
      ),
      activeClass: "border-[rgba(120,145,255,0.5)] bg-[linear-gradient(145deg,rgba(30,123,255,0.34)_0%,rgba(143,56,255,0.3)_68%,rgba(255,180,0,0.14)_100%)] shadow-[0_18px_30px_-22px_rgba(30,123,255,0.95)]",
      idleClass: "border-[rgba(120,145,255,0.3)] bg-[linear-gradient(145deg,rgba(30,123,255,0.18)_0%,rgba(143,56,255,0.16)_68%,rgba(255,180,0,0.08)_100%)] hover:border-[rgba(120,145,255,0.48)]",
      modalTitle: "Execution Destinations",
      modalSubtitle: "Review delivery channels, connections, and export paths from one place.",
      modalWidth: "max-w-3xl",
    },
    {
      id: "approval",
      title: "Approval",
      icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" className="h-5 w-5"><path d="m5 12 4 4L19 6" /></svg>,
      activeClass: "border-[rgba(56,255,179,0.48)] bg-[linear-gradient(145deg,rgba(56,255,179,0.26)_0%,rgba(30,123,255,0.22)_68%,rgba(143,56,255,0.16)_100%)]",
      idleClass: "border-[rgba(120,145,255,0.24)] bg-[rgba(255,255,255,0.03)] hover:border-[rgba(56,255,179,0.38)]",
      modalTitle: "Approval",
      modalSubtitle: "Check readiness and approve the meeting when the action plan is confirmed.",
      modalWidth: "max-w-2xl",
    },
    {
      id: "tickets",
      title: "Tickets",
      icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" className="h-5 w-5"><path d="M7 8h10v8H7z" /><path d="M10 8V6" /><path d="M14 8V6" /></svg>,
      activeClass: "border-[rgba(255,180,0,0.48)] bg-[linear-gradient(145deg,rgba(255,180,0,0.24)_0%,rgba(30,123,255,0.18)_68%,rgba(143,56,255,0.14)_100%)]",
      idleClass: "border-[rgba(120,145,255,0.24)] bg-[rgba(255,255,255,0.03)] hover:border-[rgba(255,180,0,0.38)]",
      modalTitle: "Tickets",
      modalSubtitle: "Created issues, sync history, and export results.",
      modalWidth: "max-w-3xl",
    },
    {
      id: "people",
      title: "People",
      icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" className="h-5 w-5"><path d="M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" /><path d="M15 13a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z" /><path d="M4 19a5 5 0 0 1 10 0" /><path d="M13 19a4 4 0 0 1 7 0" /></svg>,
      activeClass: "border-[rgba(56,255,179,0.42)] bg-[linear-gradient(145deg,rgba(56,255,179,0.2)_0%,rgba(255,255,255,0.08)_68%,rgba(30,123,255,0.12)_100%)]",
      idleClass: "border-[rgba(120,145,255,0.24)] bg-[rgba(255,255,255,0.03)] hover:border-[rgba(56,255,179,0.34)]",
      modalTitle: "People",
      modalSubtitle: "Attendees, owners, and responsible people for this meeting.",
      modalWidth: "max-w-3xl",
    },
    {
      id: "files",
      title: "Files",
      icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" className="h-5 w-5"><path d="M7 4h7l3 3v13H7z" /><path d="M14 4v4h4" /></svg>,
      activeClass: "border-[rgba(120,145,255,0.44)] bg-[linear-gradient(145deg,rgba(30,123,255,0.22)_0%,rgba(255,255,255,0.06)_68%,rgba(143,56,255,0.12)_100%)]",
      idleClass: "border-[rgba(120,145,255,0.24)] bg-[rgba(255,255,255,0.03)] hover:border-[rgba(120,145,255,0.42)]",
      modalTitle: "Files",
      modalSubtitle: "Uploaded media, transcript artifacts, and generated outputs.",
      modalWidth: "max-w-3xl",
    },
    {
      id: "notifications",
      title: "Notifications",
      icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" className="h-5 w-5"><path d="M12 4a4 4 0 0 1 4 4v2.5c0 .8.3 1.6.9 2.2l1.1 1.1H6l1.1-1.1c.6-.6.9-1.4.9-2.2V8a4 4 0 0 1 4-4Z" /><path d="M10 18a2 2 0 0 0 4 0" /></svg>,
      activeClass: "border-[rgba(255,107,122,0.46)] bg-[linear-gradient(145deg,rgba(255,107,122,0.2)_0%,rgba(30,123,255,0.16)_68%,rgba(255,255,255,0.06)_100%)]",
      idleClass: "border-[rgba(120,145,255,0.24)] bg-[rgba(255,255,255,0.03)] hover:border-[rgba(255,107,122,0.34)]",
      modalTitle: "Notifications",
      modalSubtitle: "Logs, failed sends, pending work, and alerts.",
      modalWidth: "max-w-3xl",
    },
    {
      id: "settings",
      title: "Settings",
      icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" className="h-5 w-5"><path d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Z" /><path d="M19 12a7 7 0 0 0-.1-1l2-1.5-2-3.5-2.3.8a7.6 7.6 0 0 0-1.7-1L14.5 3h-5l-.4 2.8a7.6 7.6 0 0 0-1.7 1l-2.3-.8-2 3.5 2 1.5a7 7 0 0 0 0 2l-2 1.5 2 3.5 2.3-.8a7.6 7.6 0 0 0 1.7 1l.4 2.8h5l.4-2.8a7.6 7.6 0 0 0 1.7-1l2.3.8 2-3.5-2-1.5c.1-.3.1-.7.1-1Z" /></svg>,
      activeClass: "border-[rgba(120,145,255,0.46)] bg-[linear-gradient(145deg,rgba(120,145,255,0.22)_0%,rgba(255,255,255,0.06)_68%,rgba(30,123,255,0.12)_100%)]",
      idleClass: "border-[rgba(120,145,255,0.24)] bg-[rgba(255,255,255,0.03)] hover:border-[rgba(120,145,255,0.38)]",
      modalTitle: "Settings",
      modalSubtitle: "Meeting-level export defaults and automation preferences.",
      modalWidth: "max-w-6xl",
    },
  ];

  const activeToolMeta = activeSidebarTool ? sidebarTools.find((tool) => tool.id === activeSidebarTool) ?? null : null;

  const renderSidebarToolContent = () => {
    switch (activeSidebarTool) {
      case "integrations":
        return renderIntegrationsPanel();
      case "approval":
        return renderApprovalPanel();
      case "transcript":
        return renderTranscriptPanel();
      case "summary":
        return renderSummaryPanel();
      case "chat":
        return renderChatPanel();
      case "tickets":
        return renderTicketsPanel();
      case "people":
        return renderPeoplePanel();
      case "files":
        return renderFilesPanel();
      case "timeline":
        return renderTimelinePanel();
      case "notifications":
        return renderNotificationsPanel();
      case "settings":
        return renderSettingsPanel();
      default:
        return null;
    }
  };

  return (
    <RequireAuth>
      <AppShell
        sidebarContent={
          <div className="space-y-3 overflow-y-auto pr-1">
            {sidebarTools.map((tool) => {
              const isActive = activeSidebarTool === tool.id;
              return (
                <button
                  key={tool.id}
                  type="button"
                  onClick={() => setActiveSidebarTool(tool.id)}
                  className={`group relative w-full overflow-hidden rounded-[22px] border p-4 text-left transition ${
                    isActive ? tool.activeClass : tool.idleClass
                  }`}
                >
                  <span className="absolute inset-y-3 left-0 w-1 rounded-r-full bg-[linear-gradient(180deg,var(--accent)_0%,var(--accent-strong)_100%)]" />
                  <div className="ml-3 flex items-start gap-3">
                    <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-[rgba(120,145,255,0.24)] bg-[rgba(7,12,30,0.72)] text-[var(--text-primary)]">
                      {tool.icon}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-base font-semibold text-[var(--text-primary)]">{tool.title}</p>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        }
        sidebarCollapsedContent={
          <div className="flex flex-col items-center gap-4 overflow-y-auto px-1 pt-2">
            {sidebarTools.map((tool) => {
              const isActive = activeSidebarTool === tool.id;
              return (
                <button
                  key={tool.id}
                  type="button"
                  onClick={() => setActiveSidebarTool(tool.id)}
                  className={`group relative flex h-16 w-16 shrink-0 items-center justify-center rounded-[24px] border transition ${
                    isActive ? tool.activeClass : tool.idleClass
                  }`}
                  aria-label={`Open ${tool.title}`}
                  title={tool.title}
                >
                  <div className="absolute inset-1 rounded-[20px] border border-[rgba(255,255,255,0.08)] bg-[rgba(4,9,24,0.28)]" />
                  <div className="relative z-10 flex h-10 w-10 items-center justify-center rounded-2xl border border-[rgba(120,145,255,0.2)] bg-[rgba(255,255,255,0.04)] text-[var(--text-primary)] shadow-[0_12px_24px_-18px_rgba(0,0,0,0.85)]">
                    {tool.icon}
                  </div>
                </button>
              );
            })}
          </div>
        }
      >
        {loading && <p className="text-sm text-[var(--text-secondary)]">Loading meeting...</p>}
        {error && <p className="mb-4 text-sm font-medium text-[var(--danger)]">{error}</p>}

        {data && (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,2.25fr)_minmax(360px,1fr)] 2xl:grid-cols-[minmax(0,2.45fr)_minmax(420px,1fr)]">
          <div className="space-y-6">
            <Card
              title={data.meeting.title}
              subtitle={new Date(data.meeting.createdAt).toLocaleString()}
              rightSlot={<StatusPill label={data.meeting.status.toUpperCase()} tone={statusTone(data.meeting.status)} />}
            >
              <p className="text-sm text-[var(--text-secondary)]">
                Attendees: {data.meeting.attendees.join(", ") || "none"}
              </p>
            </Card>

            <Card
              title="Transcript"
              subtitle="Generated in process stage"
              rightSlot={
                <div className="flex items-center gap-2">
                  <select
                    value={downloadFormat}
                    onChange={(event) => setDownloadFormat(event.target.value as DownloadFormat)}
                    className="rounded-lg border border-[var(--border)] bg-[var(--surface-strong)] px-2 py-1.5 text-xs font-semibold uppercase tracking-[0.06em] text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
                  >
                    <option value="txt">TXT</option>
                    <option value="csv">CSV</option>
                    <option value="pdf">PDF</option>
                    <option value="docx">DOCX</option>
                  </select>
                  <Button variant="secondary" onClick={() => void handleDownloadTranscript()} disabled={!data.transcript?.text}>
                    Download
                  </Button>
                </div>
              }
            >
              <p className="max-h-72 overflow-auto whitespace-pre-wrap rounded-xl bg-[var(--surface-strong)] p-4 text-sm text-[var(--text-secondary)]">
                {data.transcript?.text ?? "No transcript"}
              </p>
            </Card>

            <Card title="Intelligence Workspace" subtitle="Switch between summary and AI chat">
              <div className="space-y-4">
                <div className="inline-flex rounded-xl border border-[var(--border)] bg-[rgba(9,14,36,0.75)] p-1">
                  <button
                    type="button"
                    onClick={() => setActiveTab("summary")}
                    className={`relative rounded-lg px-4 py-2 text-sm font-semibold transition ${
                      activeTab === "summary" ? "text-[var(--text-primary)]" : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                    }`}
                  >
                    {activeTab === "summary" && (
                      <motion.span
                        layoutId="workspace-tab-active-pill"
                        className="absolute inset-0 rounded-lg bg-[rgba(30,123,255,0.2)] shadow-[0_0_0_1px_rgba(120,145,255,0.48)]"
                        transition={{ type: "spring", stiffness: 340, damping: 30 }}
                      />
                    )}
                    <span className="relative z-10">Summary</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab("chat")}
                    className={`relative rounded-lg px-4 py-2 text-sm font-semibold transition ${
                      activeTab === "chat" ? "text-[var(--text-primary)]" : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                    }`}
                  >
                    {activeTab === "chat" && (
                      <motion.span
                        layoutId="workspace-tab-active-pill"
                        className="absolute inset-0 rounded-lg bg-[rgba(143,56,255,0.2)] shadow-[0_0_0_1px_rgba(143,56,255,0.45)]"
                        transition={{ type: "spring", stiffness: 340, damping: 30 }}
                      />
                    )}
                    <span className="relative z-10">Chat</span>
                  </button>
                </div>

                <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-strong)] p-4">
                  <AnimatePresence mode="wait" initial={false}>
                    {activeTab === "summary" ? (
                      <motion.div
                        key="summary-pane"
                        initial={{ opacity: 0, y: 10, filter: "blur(4px)" }}
                        animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                        exit={{ opacity: 0, y: -8, filter: "blur(3px)" }}
                        transition={{ duration: 0.24, ease: "easeOut" }}
                        className="grid gap-4 text-sm text-[var(--text-secondary)]"
                      >
                        <p>
                          <strong className="text-[var(--text-primary)]">Decisions:</strong> {data.summary?.decisions ?? "-"}
                        </p>
                        <p>
                          <strong className="text-[var(--text-primary)]">Risks:</strong> {data.summary?.risks ?? "-"}
                        </p>
                        <p>
                          <strong className="text-[var(--text-primary)]">Notes:</strong> {data.summary?.notes ?? "-"}
                        </p>
                      </motion.div>
                    ) : (
                      <motion.div
                        key="chat-pane"
                        initial={{ opacity: 0, y: 10, filter: "blur(4px)" }}
                        animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                        exit={{ opacity: 0, y: -8, filter: "blur(3px)" }}
                        transition={{ duration: 0.24, ease: "easeOut" }}
                        className="space-y-3"
                      >
                        <div className="flex items-center justify-between gap-2">
                          {chatHasMore ? (
                            <Button variant="ghost" onClick={handleLoadOlderMessages} disabled={chatHistoryLoading}>
                              {chatHistoryLoading ? "Loading older..." : "Load Older Messages"}
                            </Button>
                          ) : (
                            <span className="text-xs text-[var(--text-muted)]">Latest conversation loaded</span>
                          )}
                          <Button variant="ghost" onClick={() => setConfirmClearOpen(true)} disabled={chatClearing}>
                            {chatClearing ? "Clearing..." : "Clear Chat"}
                          </Button>
                        </div>

                        <AnimatePresence>
                          {confirmClearOpen && (
                            <motion.div
                              initial={{ opacity: 0, y: -6 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0, y: -6 }}
                              className="rounded-xl border border-[rgba(255,107,122,0.35)] bg-[rgba(255,107,122,0.1)] p-3"
                            >
                              <p className="text-sm font-medium text-[var(--text-primary)]">Clear this meeting chat history?</p>
                              <p className="mt-1 text-xs text-[var(--text-secondary)]">
                                This removes all saved messages for this meeting.
                              </p>
                              <div className="mt-3 flex gap-2">
                                <Button variant="secondary" onClick={handleClearChat} disabled={chatClearing}>
                                  {chatClearing ? "Clearing..." : "Yes, Clear"}
                                </Button>
                                <Button variant="ghost" onClick={() => setConfirmClearOpen(false)} disabled={chatClearing}>
                                  Cancel
                                </Button>
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>

                        <div
                          ref={chatViewportRef}
                          className="relative max-h-72 space-y-2 overflow-auto rounded-xl border border-[var(--border)] bg-[rgba(6,10,26,0.96)] p-3"
                        >
                          <div className="pointer-events-none absolute inset-0 opacity-70">
                            <div className="absolute -top-10 right-6 h-28 w-28 rounded-full bg-[rgba(143,56,255,0.2)] blur-2xl" />
                            <div className="absolute -bottom-8 left-5 h-24 w-24 rounded-full bg-[rgba(30,123,255,0.2)] blur-2xl" />
                          </div>

                          <div className="relative z-10 space-y-2">
                            {chatMessages.length === 0 && (
                              <p className="text-xs text-[var(--text-muted)]">
                                Try: &quot;What decisions were made?&quot;, &quot;Who owns onboarding?&quot;,
                                &quot;What are blockers?&quot;
                              </p>
                            )}
                            <AnimatePresence initial={false}>
                              {chatMessages.map((message) => (
                                <ChatConversationBubble key={message.id} message={message} />
                              ))}
                              {chatLoading && <ChatTypingIndicator key="typing-indicator" />}
                            </AnimatePresence>
                          </div>
                        </div>

                        <div className="flex gap-2">
                          <input
                            value={question}
                            onChange={(event) => setQuestion(event.target.value)}
                            onKeyDown={handleQuestionKeyDown}
                            placeholder="Ask about decisions, owners, risks, deadlines..."
                            className="flex-1 rounded-xl border border-[var(--border)] bg-[var(--surface-strong)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
                          />
                          <Button onClick={handleAsk} disabled={chatLoading || !question.trim()}>
                            {chatLoading ? "Asking..." : "Ask"}
                          </Button>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            </Card>

            {renderActionPlanFlowchart()}
          </div>

          <div className="space-y-4">
            <div className="rounded-2xl border border-[rgba(120,145,255,0.24)] bg-[linear-gradient(135deg,rgba(30,123,255,0.12)_0%,rgba(143,56,255,0.08)_58%,rgba(255,180,0,0.06)_100%)] p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">Review Control Center</p>
              <p className="mt-2 text-sm text-[var(--text-secondary)]">
                Move between execution, destinations, and delivery activity without stacking every control in one column.
              </p>
            </div>
            <Tabs
              defaultValue="execution"
              tabs={[
                {
                  title: "Execution",
                  value: "execution",
                  meta: `${data.actions.length} action${data.actions.length === 1 ? "" : "s"}`,
                  content: renderExecutionPanel(),
                },
              ]}
            />
          </div>
          </div>
        )}

        <AnimatePresence>
          {jiraExportModalOpen && (
            <ExecutionHubModal
              open={jiraExportModalOpen}
              activeDestination={executionHubTab}
              destinationOptions={EXECUTION_DESTINATION_OPTIONS}
              selectedDestinationTitle={executionHubTab === "jira" ? "Jira Delivery" : "Email Follow-Up"}
              selectedDestinationDetail={
                executionHubTab === "jira"
                  ? "Create linked execution tickets and sync them back to OrbitPlan."
                  : "Send a structured action-plan follow-up using OrbitPlan's execution profile."
              }
              selectedSections={selectedTicketFormat.sections}
              onClose={() => setJiraExportModalOpen(false)}
              onSelectDestination={(destination) => setExecutionState((current) => ({ ...current, activeDestination: destination }))}
            >
              {executionHubTab === "jira" ? renderJiraExportContent() : renderEmailExportContent()}
            </ExecutionHubModal>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {activeToolMeta && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(2,4,12,0.72)] p-4 backdrop-blur-md"
              onClick={() => setActiveSidebarTool(null)}
            >
              <motion.div
                initial={{ opacity: 0, y: 24, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 16, scale: 0.98 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
                className={`max-h-[85vh] w-full ${activeToolMeta.modalWidth ?? "max-w-3xl"} overflow-auto rounded-[28px] border border-[rgba(120,145,255,0.3)] bg-[rgba(5,9,24,0.96)] p-5 shadow-[0_28px_80px_-36px_rgba(0,0,0,0.95)]`}
                onClick={(event) => event.stopPropagation()}
              >
                <div className="mb-4 flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">{activeToolMeta.title}</p>
                    <h2 className="mt-1 text-2xl font-semibold text-[var(--text-primary)]">{activeToolMeta.modalTitle}</h2>
                    <p className="mt-1 text-sm text-[var(--text-secondary)]">{activeToolMeta.modalSubtitle}</p>
                  </div>
                  <Button variant="ghost" onClick={() => setActiveSidebarTool(null)}>
                    Close
                  </Button>
                </div>

                {renderSidebarToolContent()}
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </AppShell>
    </RequireAuth>
  );
}
