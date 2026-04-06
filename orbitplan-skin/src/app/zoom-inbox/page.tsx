"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { RequireAuth } from "@/components/auth/require-auth";
import { AppShell } from "@/components/layout/app-shell";
import { Card } from "@/components/ui/card";
import { StatusPill } from "@/components/ui/status-pill";
import { Button } from "@/components/ui/button";
import { ApiRequestError, getMeetingProviderInbox, getMeetingProviderStatus, syncMeetingProviderInbox } from "@/lib/api";
import type { MeetingProviderInboxItem, MeetingProviderIntegrationStatus, MeetingProviderSyncResult } from "@/types/meetingProvider";

const formatDateTime = (value?: string) => {
  if (!value) return "Not available yet";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
};

const statusTone = (status: MeetingProviderInboxItem["status"]): "neutral" | "success" | "warning" => {
  if (status === "approved") return "success";
  if (status === "ready") return "success";
  if (status === "error") return "warning";
  return "neutral";
};

export default function ZoomInboxPage() {
  const [items, setItems] = useState<MeetingProviderInboxItem[]>([]);
  const [status, setStatus] = useState<MeetingProviderIntegrationStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<MeetingProviderSyncResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async (mode: "initial" | "refresh" = "initial") => {
    if (mode === "initial") setLoading(true);
    else setRefreshing(true);
    setError(null);

    try {
      const [providerStatus, inboxItems] = await Promise.all([
        getMeetingProviderStatus("zoom"),
        getMeetingProviderInbox("zoom"),
      ]);
      setStatus(providerStatus);
      setItems(inboxItems);
    } catch (loadError) {
      const message =
        loadError instanceof ApiRequestError
          ? loadError.message
          : loadError instanceof Error
            ? loadError.message
            : "Unable to load Zoom recordings inbox.";
      setError(message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const handleSync = async () => {
    setSyncing(true);
    setError(null);
    setSyncResult(null);

    try {
      const result = await syncMeetingProviderInbox("zoom");
      setSyncResult(result);
      await load("refresh");
    } catch (syncError) {
      const message =
        syncError instanceof ApiRequestError
          ? syncError.message
          : syncError instanceof Error
            ? syncError.message
            : "Unable to sync Zoom recordings.";
      setError(message);
    } finally {
      setSyncing(false);
    }
  };

  return (
    <RequireAuth>
      <AppShell>
        <div className="space-y-6">
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 backdrop-blur-md fade-in">
            <p className="text-xs uppercase tracking-[0.16em] text-[var(--text-muted)]">Zoom Intake</p>
            <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="text-2xl font-bold">Zoom Recordings Inbox</h2>
                <p className="mt-2 max-w-3xl text-sm text-[var(--text-secondary)]">
                  This inbox shows Zoom recordings OrbitPlan has already imported. Once Zoom finishes cloud-processing a recording and sends the webhook, it should appear here and open into the normal review workflow.
                </p>
              </div>
              <div className="flex items-center gap-3">
                <StatusPill
                  label={status?.connected ? "Zoom Connected" : "Zoom Not Connected"}
                  tone={status?.connected ? "success" : "warning"}
                />
                <Button onClick={() => void handleSync()} disabled={loading || refreshing || syncing || !status?.connected}>
                  {syncing ? "Syncing..." : "Sync From Zoom Cloud"}
                </Button>
                <Button variant="secondary" onClick={() => void load("refresh")} disabled={loading || refreshing}>
                  {refreshing ? "Refreshing..." : "Refresh"}
                </Button>
              </div>
            </div>
          </div>

          {syncResult && (
            <Card title="Sync Complete" subtitle="Existing Zoom cloud recordings were checked.">
              <p className="text-sm text-[var(--text-secondary)]">
                Imported {syncResult.imported} recording{syncResult.imported === 1 ? "" : "s"}, skipped {syncResult.skipped}, scanned {syncResult.total} total.
              </p>
            </Card>
          )}

          {!loading && status && !status.connected && (
            <Card title="Connection Required" subtitle="Zoom needs to be connected before recordings can arrive.">
              <div className="space-y-4">
                <p className="text-sm text-[var(--text-secondary)]">
                  OrbitPlan is not currently connected to Zoom for this account. Connect Zoom first, then this inbox will start filling as recordings are received.
                </p>
                <div>
                  <Link
                    href="/integrations"
                    className="inline-flex rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-sm font-semibold text-[var(--text-primary)] transition hover:bg-[var(--surface-muted)]"
                  >
                    Open Integrations
                  </Link>
                </div>
              </div>
            </Card>
          )}

          {error && (
            <Card title="Inbox Error" subtitle="The inbox could not be loaded.">
              <p className="text-sm text-[var(--danger)]">{error}</p>
            </Card>
          )}

          {loading ? (
            <Card title="Loading Inbox" subtitle="Checking imported Zoom recordings.">
              <p className="text-sm text-[var(--text-secondary)]">Pulling your latest Zoom imports from the API...</p>
            </Card>
          ) : !error && items.length === 0 ? (
            <Card title="No Recordings Yet" subtitle="Nothing has been imported from Zoom so far.">
              <div className="space-y-3 text-sm text-[var(--text-secondary)]">
                <p>Once Zoom finishes cloud-recording processing and sends the webhook, OrbitPlan will create a meeting and it will appear here.</p>
                <p>If you just stopped a recording, give Zoom a few minutes to finish processing before checking again.</p>
                <p>You can also use “Sync From Zoom Cloud” to pull in recordings that already exist in your Zoom account.</p>
              </div>
            </Card>
          ) : (
            <div className="grid gap-4">
              {items.map((item) => (
                <Card
                  key={item.id}
                  title={item.title}
                  subtitle={item.organizerEmail ? `Host: ${item.organizerEmail}` : "Zoom import"}
                  rightSlot={<StatusPill label={item.status} tone={statusTone(item.status)} />}
                >
                  <div className="grid gap-4 md:grid-cols-[1.3fr_0.9fr_auto] md:items-center">
                    <div className="space-y-2 text-sm text-[var(--text-secondary)]">
                      <p>Recorded: {formatDateTime(item.scheduledAt ?? item.createdAt)}</p>
                      <p>Imported: {formatDateTime(item.createdAt)}</p>
                      <p>Attendees: {item.attendeeCount}</p>
                      <p>
                        Assets: {item.hasRecordingFile ? "recording saved" : "recording pending"} /{" "}
                        {item.hasTranscript ? "transcript ready" : "transcript pending"}
                      </p>
                      {item.processingError && <p className="text-[var(--danger)]">Processing error: {item.processingError}</p>}
                    </div>
                    <div className="space-y-2 text-sm text-[var(--text-secondary)]">
                      <p className="font-medium text-[var(--text-primary)]">Next step</p>
                      <p>
                        {item.status === "ready" || item.status === "approved"
                          ? "Open the review workspace to inspect summary, transcript, and action items."
                          : item.status === "error"
                            ? "Review the error state first, then retry or inspect the API logs."
                            : "OrbitPlan is still processing this recording. Refresh in a moment."}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-3 md:justify-end">
                      <Link
                        href={`/review/${item.id}`}
                        className="inline-flex rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-sm font-semibold text-[var(--text-primary)] transition hover:bg-[var(--surface-muted)]"
                      >
                        Open Review
                      </Link>
                      {item.externalUrl && (
                        <a
                          href={item.externalUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex rounded-xl border border-[var(--border)] bg-[rgba(255,255,255,0.04)] px-4 py-2 text-sm font-semibold text-[var(--text-secondary)] transition hover:text-[var(--text-primary)]"
                        >
                          Open Zoom
                        </a>
                      )}
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      </AppShell>
    </RequireAuth>
  );
}
