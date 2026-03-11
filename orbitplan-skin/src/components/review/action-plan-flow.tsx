"use client";

import { Card } from "@/components/ui/card";
import type { ActionPriority, ActionStatus } from "@/types/action";

type WorkflowStep = {
  key: string;
  label: string;
  detail: string;
  isComplete: boolean;
};

type ActionPlanFlowAction = {
  id: string;
  description: string;
  ownerEmail: string | null;
  dueDate: string | null;
  status: ActionStatus;
  priority: ActionPriority;
  jiraIssueUrl: string | null;
  jiraSyncLabel: string;
};

type ActionPlanFlowProps = {
  workflowSteps: WorkflowStep[];
  actionCount: number;
  deliveryComplete: boolean;
  deliveryButtonLabel: string;
  jiraProjectUrl: string | null;
  actions: ActionPlanFlowAction[];
  statusBadgeClass: Record<ActionStatus, string>;
  priorityBadgeClass: Record<ActionPriority, string>;
  formatActionStatusLabel: (status: ActionStatus) => string;
  formatActionPriorityLabel: (priority: ActionPriority) => string;
  onOpenExecutionHub: () => void;
};

export function ActionPlanFlow({
  workflowSteps,
  actionCount,
  deliveryComplete,
  deliveryButtonLabel,
  jiraProjectUrl,
  actions,
  statusBadgeClass,
  priorityBadgeClass,
  formatActionStatusLabel,
  formatActionPriorityLabel,
  onOpenExecutionHub,
}: ActionPlanFlowProps) {
  return (
    <Card title="Action Plan Flow" subtitle="Visual map of the current delivery path">
      <div className="space-y-6">
        <div className="grid gap-3 xl:grid-cols-4">
          {workflowSteps.map((step, index) => (
            <div
              key={step.key}
              className={`relative rounded-[24px] border p-4 ${
                step.key === "delivery" && deliveryComplete
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
                    step.key === "delivery" && deliveryComplete
                      ? "border-[rgba(56,255,179,0.36)] bg-[rgba(56,255,179,0.16)] text-[var(--success)]"
                      : step.isComplete
                        ? "border-[rgba(56,255,179,0.34)] bg-[rgba(56,255,179,0.12)] text-[var(--success)]"
                        : "border-[rgba(120,145,255,0.18)] bg-[rgba(255,255,255,0.05)] text-[var(--text-muted)]"
                  }`}
                >
                  {step.key === "delivery" && deliveryComplete ? "Exported" : step.isComplete ? "Active" : "Pending"}
                </span>
              </div>
              <p className="mt-3 text-sm text-[var(--text-secondary)]">{step.detail}</p>
              {step.key === "delivery" && (
                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={onOpenExecutionHub}
                    className={`inline-flex rounded-full border px-3 py-1.5 text-xs font-semibold transition hover:text-[var(--text-primary)] ${
                      deliveryComplete
                        ? "border-[rgba(56,255,179,0.34)] bg-[rgba(56,255,179,0.14)] text-[var(--success)]"
                        : "border-[rgba(108,242,255,0.28)] bg-[rgba(108,242,255,0.1)] text-[var(--accent)]"
                    }`}
                  >
                    {deliveryButtonLabel}
                  </button>
                  {jiraProjectUrl && (
                    <a
                      href={jiraProjectUrl}
                      target="_blank"
                      rel="noreferrer"
                      className={`inline-flex rounded-full border px-3 py-1.5 text-xs font-semibold transition hover:text-[var(--text-primary)] ${
                        deliveryComplete
                          ? "border-[rgba(56,255,179,0.28)] bg-[rgba(56,255,179,0.1)] text-[var(--success)]"
                          : "border-[rgba(120,145,255,0.2)] bg-[rgba(255,255,255,0.04)] text-[var(--text-secondary)]"
                      }`}
                    >
                      {deliveryComplete ? "Open Exported Jira Project" : "Open Jira Project"}
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

          {actionCount === 0 ? (
            <div className="mt-4 rounded-2xl border border-dashed border-[rgba(120,145,255,0.18)] bg-[rgba(255,255,255,0.02)] p-6 text-sm text-[var(--text-secondary)]">
              No actions generated yet.
            </div>
          ) : (
            <div className="mt-5 overflow-x-auto pb-2">
              <div className="flex min-w-max items-stretch gap-4">
                {actions.map((action, index) => (
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
                          <span className="font-semibold text-[var(--text-primary)]">Jira:</span> {action.jiraSyncLabel}
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

                    {index < actions.length - 1 && (
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
}
