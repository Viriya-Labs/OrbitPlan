"use client";

import type { ReactNode } from "react";
import { MultiStepLoader } from "@/components/aceternity/multi-step-loader";
import { Button } from "@/components/ui/button";
import type {
  JiraCreateFieldMeta,
  JiraExportResult,
  JiraIntegrationStatus,
  JiraIssueTypeCreateMeta,
  JiraProject,
  JiraScanResult,
  JiraSite,
} from "@/types/jira";

type JiraTicketDetailsDraft = {
  issueType: string;
  labelsText: string;
  componentsText: string;
  environment: string;
  additionalContext: string;
  advancedFieldsJson: string;
};

type JiraExecutionPanelProps = {
  profileSelector: ReactNode;
  jiraStatus: JiraIntegrationStatus | null;
  jiraConnectedNotice: boolean;
  jiraStage: "idle" | "scanning" | "blocked" | "exporting" | "complete";
  jiraExporting: boolean;
  jiraLoaderStep: number;
  jiraCloudId: string;
  jiraProjectKey: string;
  jiraSites: JiraSite[];
  jiraProjects: JiraProject[];
  jiraLoading: boolean;
  jiraIssueTypes: JiraIssueTypeCreateMeta[];
  selectedJiraIssueType: JiraIssueTypeCreateMeta | null;
  jiraTicketDetails: JiraTicketDetailsDraft;
  jiraCreateMetaLoading: boolean;
  jiraDynamicFields: JiraCreateFieldMeta[];
  allActionsAlreadyLinked: boolean;
  actionsConfirmed: boolean;
  hasActions: boolean;
  jiraScanResult: JiraScanResult | null;
  jiraResult: JiraExportResult | null;
  loadingStates: ReadonlyArray<{ title: string; description: string }>;
  renderDynamicJiraField: (field: JiraCreateFieldMeta) => ReactNode;
  onConnectJira: () => void;
  onRefreshJira: () => void;
  onExportToJira: () => void;
  onCloudChange: (value: string) => void;
  onProjectChange: (value: string) => void;
  onIssueTypeChange: (value: string) => void;
  onLabelsChange: (value: string) => void;
  onComponentsChange: (value: string) => void;
  onEnvironmentChange: (value: string) => void;
  onAdditionalContextChange: (value: string) => void;
  onAdvancedFieldsChange: (value: string) => void;
};

export function JiraExecutionPanel({
  profileSelector,
  jiraStatus,
  jiraConnectedNotice,
  jiraStage,
  jiraExporting,
  jiraLoaderStep,
  jiraCloudId,
  jiraProjectKey,
  jiraSites,
  jiraProjects,
  jiraLoading,
  jiraIssueTypes,
  selectedJiraIssueType,
  jiraTicketDetails,
  jiraCreateMetaLoading,
  jiraDynamicFields,
  allActionsAlreadyLinked,
  actionsConfirmed,
  hasActions,
  jiraScanResult,
  jiraResult,
  loadingStates,
  renderDynamicJiraField,
  onConnectJira,
  onRefreshJira,
  onExportToJira,
  onCloudChange,
  onProjectChange,
  onIssueTypeChange,
  onLabelsChange,
  onComponentsChange,
  onEnvironmentChange,
  onAdditionalContextChange,
  onAdvancedFieldsChange,
}: JiraExecutionPanelProps) {
  return (
    <div className="space-y-4">
      {profileSelector}
      {!jiraStatus?.configured && (
        <p className="text-sm text-[var(--text-secondary)]">
          Set `JIRA_CLIENT_ID`, `JIRA_CLIENT_SECRET`, and `JIRA_REDIRECT_URI` in the API env first.
        </p>
      )}

      {jiraStatus?.configured && !jiraStatus.connected && (
        <div className="space-y-3">
          <p className="text-sm text-[var(--text-secondary)]">
            Connect Jira first, then choose the destination project and export the confirmed actions from here.
          </p>
          <Button variant="secondary" onClick={onConnectJira}>
            Connect Jira
          </Button>
        </div>
      )}

      {jiraStatus?.configured && jiraStatus.connected && (
        <div className="space-y-4">
          {jiraConnectedNotice && (
            <div className="rounded-xl border border-[rgba(56,255,179,0.35)] bg-[rgba(56,255,179,0.1)] p-3">
              <p className="text-sm font-semibold text-[var(--text-primary)]">Jira connected successfully</p>
            </div>
          )}
          {jiraStage === "complete" && (
            <div className="rounded-2xl border border-[rgba(56,255,179,0.34)] bg-[linear-gradient(135deg,rgba(56,255,179,0.14)_0%,rgba(30,123,255,0.1)_100%)] p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-[rgba(56,255,179,0.34)] bg-[rgba(56,255,179,0.16)] text-[var(--success)]">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
                    <path d="m5 12 4 4L19 6" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-semibold text-[var(--text-primary)]">Jira export completed</p>
                  <p className="mt-1 text-xs text-[var(--text-secondary)]">
                    Tickets were created successfully and linked back to this meeting.
                  </p>
                </div>
              </div>
            </div>
          )}

          <div className="space-y-3">
            <MultiStepLoader
              loadingStates={loadingStates.map((item) => ({ ...item }))}
              currentStep={jiraLoaderStep}
              loading={jiraStage === "scanning" || jiraStage === "exporting"}
              blocked={jiraStage === "blocked"}
              blockedLabel="Export Gated"
            />
            <p className="text-sm text-[var(--text-secondary)]">
              {jiraStage === "scanning" && "Scanning ticket quality and checking export blockers..."}
              {jiraStage === "exporting" && "Scan passed. Sending approved tickets to Jira..."}
              {jiraStage === "complete" && "Export completed successfully."}
              {jiraStage === "blocked" && "Scan found blockers. Review the report below before exporting."}
              {jiraStage === "idle" && "Submit to Jira will run a scan first, then export only if the scan passes."}
            </p>
          </div>

          <div className="grid gap-3 xl:grid-cols-2">
            <select
              value={jiraCloudId}
              onChange={(event) => onCloudChange(event.target.value)}
              className="rounded-xl border border-[var(--border)] bg-[var(--surface-strong)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
              disabled={jiraLoading || jiraExporting}
            >
              {jiraSites.map((site) => (
                <option key={site.id} value={site.id}>
                  {site.name}
                </option>
              ))}
            </select>

            <select
              value={jiraProjectKey}
              onChange={(event) => onProjectChange(event.target.value)}
              className="rounded-xl border border-[var(--border)] bg-[var(--surface-strong)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
              disabled={jiraLoading || jiraExporting || jiraProjects.length === 0}
            >
              {jiraProjects.map((project) => (
                <option key={project.id} value={project.key}>
                  {project.key} - {project.name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-4 rounded-2xl border border-[rgba(120,145,255,0.18)] bg-[rgba(7,12,30,0.36)] p-4">
            <div>
              <p className="text-sm font-semibold text-[var(--text-primary)]">Ticket fields</p>
              <p className="mt-1 text-xs text-[var(--text-secondary)]">
                Configure the Jira payload here before scanning and export.
              </p>
            </div>

            <div className="grid gap-4 xl:grid-cols-2 2xl:grid-cols-4">
              <label className="space-y-2">
                <span className="text-sm font-medium text-[var(--text-secondary)]">Issue Type</span>
                {jiraIssueTypes.length > 0 ? (
                  <select
                    value={selectedJiraIssueType?.name ?? jiraTicketDetails.issueType}
                    onChange={(event) => onIssueTypeChange(event.target.value)}
                    className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface-strong)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
                  >
                    {jiraIssueTypes.map((issueType) => (
                      <option key={issueType.id} value={issueType.name}>
                        {issueType.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    value={jiraTicketDetails.issueType}
                    onChange={(event) => onIssueTypeChange(event.target.value)}
                    placeholder="Task"
                    className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface-strong)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
                  />
                )}
              </label>

              <label className="space-y-2">
                <span className="text-sm font-medium text-[var(--text-secondary)]">Labels</span>
                <input
                  value={jiraTicketDetails.labelsText}
                  onChange={(event) => onLabelsChange(event.target.value)}
                  placeholder="orbitplan, customer-facing"
                  className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface-strong)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
                />
              </label>

              <label className="space-y-2">
                <span className="text-sm font-medium text-[var(--text-secondary)]">Components</span>
                <input
                  value={jiraTicketDetails.componentsText}
                  onChange={(event) => onComponentsChange(event.target.value)}
                  placeholder="Platform API, Admin UI"
                  className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface-strong)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
                />
              </label>

              <label className="space-y-2">
                <span className="text-sm font-medium text-[var(--text-secondary)]">Environment</span>
                <input
                  value={jiraTicketDetails.environment}
                  onChange={(event) => onEnvironmentChange(event.target.value)}
                  placeholder="Production, staging, internal admin"
                  className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface-strong)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
                />
              </label>
            </div>

            <label className="block space-y-2">
              <span className="text-sm font-medium text-[var(--text-secondary)]">Additional Context</span>
              <textarea
                value={jiraTicketDetails.additionalContext}
                onChange={(event) => onAdditionalContextChange(event.target.value)}
                rows={4}
                placeholder="Escalation notes, rollout constraints, customer impact, internal references..."
                className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface-strong)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
              />
            </label>

            <div className="space-y-4 rounded-[24px] border border-[rgba(120,145,255,0.2)] bg-[rgba(255,255,255,0.03)] p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-lg font-semibold text-[var(--text-primary)]">Detected Jira Fields</p>
                  <p className="mt-1 text-sm text-[var(--text-secondary)]">
                    {jiraCreateMetaLoading
                      ? "Loading fields from Jira..."
                      : selectedJiraIssueType
                        ? `Fields available for ${selectedJiraIssueType.name} in ${jiraProjectKey}.`
                        : "Select a Jira project to load create fields."}
                  </p>
                </div>
                {selectedJiraIssueType && (
                  <span className="rounded-full border border-[rgba(120,145,255,0.2)] bg-[rgba(255,255,255,0.04)] px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-primary)]">
                    {jiraDynamicFields.length} fields
                  </span>
                )}
              </div>

              {selectedJiraIssueType && jiraDynamicFields.length > 0 ? (
                <div className="grid gap-4 xl:grid-cols-2 2xl:grid-cols-3">{jiraDynamicFields.map((field) => renderDynamicJiraField(field))}</div>
              ) : (
                <p className="text-sm text-[var(--text-secondary)]">
                  {selectedJiraIssueType
                    ? "No extra Jira create fields were detected beyond the core fields already handled here."
                    : "Connect Jira and choose a project to load project-specific fields."}
                </p>
              )}
            </div>

            <label className="block space-y-2">
              <span className="text-sm font-medium text-[var(--text-secondary)]">Advanced Jira Fields JSON</span>
              <textarea
                value={jiraTicketDetails.advancedFieldsJson}
                onChange={(event) => onAdvancedFieldsChange(event.target.value)}
                rows={8}
                placeholder={'{"customfield_10011":"ENG","customfield_10020":8}'}
                className="w-full rounded-xl border border-[var(--border)] bg-[rgba(7,12,30,0.7)] px-3 py-2 font-mono text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
              />
              <p className="text-xs text-[var(--text-secondary)]">
                Use this for custom Jira fields such as story points, team fields, epic links, request types, or any project-specific schema.
              </p>
            </label>
          </div>

          {!actionsConfirmed && <p className="text-xs text-[var(--warning)]">Confirm the action plan before exporting.</p>}
          {allActionsAlreadyLinked && (
            <div className="rounded-xl border border-[rgba(56,255,179,0.24)] bg-[rgba(56,255,179,0.08)] p-3">
              <p className="text-sm font-semibold text-[var(--text-primary)]">This meeting is already exported</p>
              <p className="mt-1 text-xs text-[var(--text-secondary)]">
                All current actions are already linked to Jira. Use the Jira links below or the per-action resync controls if you need updates.
              </p>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              onClick={onExportToJira}
              disabled={jiraExporting || !actionsConfirmed || !jiraCloudId || !jiraProjectKey || !hasActions || allActionsAlreadyLinked}
            >
              {allActionsAlreadyLinked ? "Already Exported" : jiraExporting ? "Exporting..." : "Export To Jira"}
            </Button>
            <Button variant="ghost" onClick={onRefreshJira} disabled={jiraLoading || jiraExporting}>
              {jiraLoading ? "Refreshing Jira..." : "Refresh Jira"}
            </Button>
          </div>

          {jiraScanResult && (
            <div className="rounded-xl border border-[rgba(120,145,255,0.18)] bg-[rgba(255,255,255,0.03)] p-3">
              <div className="flex flex-wrap items-center gap-3">
                <p className="text-sm font-semibold text-[var(--text-primary)]">Scan report</p>
                <span className="rounded-full border border-[rgba(56,255,179,0.3)] bg-[rgba(56,255,179,0.12)] px-2.5 py-1 text-xs font-medium text-[var(--success)]">
                  Ready {jiraScanResult.readyCount}
                </span>
                <span className="rounded-full border border-[rgba(255,107,122,0.3)] bg-[rgba(255,107,122,0.12)] px-2.5 py-1 text-xs font-medium text-[var(--danger)]">
                  Blocked {jiraScanResult.blockedCount}
                </span>
              </div>

              {jiraScanResult.blockedCount > 0 && (
                <div className="mt-3 space-y-2">
                  {jiraScanResult.items
                    .filter((item) => item.status === "blocked")
                    .map((item) => (
                      <div key={item.actionId} className="rounded-xl border border-[rgba(255,107,122,0.2)] bg-[rgba(255,107,122,0.06)] p-3">
                        <p className="text-sm font-semibold text-[var(--text-primary)]">{item.description}</p>
                        <div className="mt-2 space-y-1 text-xs text-[var(--text-secondary)]">
                          {item.reasons.map((reason) => (
                            <p key={`${item.actionId}-${reason}`}>- {reason}</p>
                          ))}
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </div>
          )}

          {jiraResult && (
            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-strong)] p-3">
              <p className="text-sm font-semibold text-[var(--text-primary)]">Created {jiraResult.createdCount} Jira issues</p>
              <div className="mt-2 space-y-1 text-xs">
                {jiraResult.issues.map((issue) => (
                  <a key={issue.key} href={issue.url} target="_blank" rel="noreferrer" className="block text-[var(--accent)] hover:underline">
                    {issue.key}
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
