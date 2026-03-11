"use client";

import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import type { EmailRecipientMode } from "@/types/execution";

type EmailExportLog = {
  id: string;
  recipient: string;
  sentAt: string;
};

type EmailExecutionPanelProps = {
  profileSelector: ReactNode;
  emailRecipientMode: EmailRecipientMode;
  emailSubject: string;
  emailCustomRecipients: string;
  emailExporting: boolean;
  emailResult: {
    createdCount: number;
    logs: EmailExportLog[];
  } | null;
  selectedTicketFormatLabel: string;
  actionsConfirmed: boolean;
  hasActions: boolean;
  onRecipientModeChange: (value: EmailRecipientMode) => void;
  onSubjectChange: (value: string) => void;
  onCustomRecipientsChange: (value: string) => void;
  onExportToEmail: () => void;
};

export function EmailExecutionPanel({
  profileSelector,
  emailRecipientMode,
  emailSubject,
  emailCustomRecipients,
  emailExporting,
  emailResult,
  selectedTicketFormatLabel,
  actionsConfirmed,
  hasActions,
  onRecipientModeChange,
  onSubjectChange,
  onCustomRecipientsChange,
  onExportToEmail,
}: EmailExecutionPanelProps) {
  return (
    <div className="space-y-4">
      {profileSelector}

      <div className="rounded-2xl border border-[rgba(120,145,255,0.18)] bg-[rgba(7,12,30,0.36)] p-4">
        <div>
          <p className="text-sm font-semibold text-[var(--text-primary)]">Email Follow-Up</p>
          <p className="mt-1 text-xs text-[var(--text-secondary)]">
            Send the action plan as a structured follow-up using the selected execution profile.
          </p>
        </div>

        <div className="mt-4 grid gap-4 xl:grid-cols-2">
          <label className="space-y-2">
            <span className="text-sm font-medium text-[var(--text-secondary)]">Recipients</span>
            <select
              value={emailRecipientMode}
              onChange={(event) => onRecipientModeChange(event.target.value as EmailRecipientMode)}
              className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface-strong)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
            >
              <option value="attendees">Meeting attendees</option>
              <option value="owners">Action owners</option>
              <option value="custom">Custom recipients</option>
            </select>
          </label>

          <label className="space-y-2">
            <span className="text-sm font-medium text-[var(--text-secondary)]">Subject</span>
            <input
              value={emailSubject}
              onChange={(event) => onSubjectChange(event.target.value)}
              placeholder={`${selectedTicketFormatLabel} follow-up`}
              className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface-strong)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
            />
          </label>
        </div>

        {emailRecipientMode === "custom" && (
          <label className="mt-4 block space-y-2">
            <span className="text-sm font-medium text-[var(--text-secondary)]">Custom Recipients</span>
            <textarea
              value={emailCustomRecipients}
              onChange={(event) => onCustomRecipientsChange(event.target.value)}
              rows={3}
              placeholder="alice@company.com, bob@company.com"
              className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface-strong)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
            />
          </label>
        )}
      </div>

      {!actionsConfirmed && <p className="text-xs text-[var(--warning)]">Confirm the action plan before exporting.</p>}

      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" onClick={onExportToEmail} disabled={emailExporting || !actionsConfirmed || !hasActions}>
          {emailExporting ? "Exporting..." : "Export To Email"}
        </Button>
      </div>

      {emailResult && (
        <div className="rounded-xl border border-[rgba(56,255,179,0.24)] bg-[rgba(56,255,179,0.08)] p-3">
          <p className="text-sm font-semibold text-[var(--text-primary)]">Created {emailResult.createdCount} email logs</p>
          <div className="mt-2 space-y-1 text-xs text-[var(--text-secondary)]">
            {emailResult.logs.map((log) => (
              <p key={log.id}>
                {log.recipient} - {new Date(log.sentAt).toLocaleString()}
              </p>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
