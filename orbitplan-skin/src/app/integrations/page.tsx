"use client";

import { useEffect, useRef, useState } from "react";
import { RequireAuth } from "@/components/auth/require-auth";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { StatusPill } from "@/components/ui/status-pill";
import {
  ApiRequestError,
  disconnectMeetingProvider,
  getJiraStatus,
  getMeetingProviderAuthUrl,
  getMeetingProviderStatus,
} from "@/lib/api";
import type { JiraIntegrationStatus } from "@/types/jira";
import type { MeetingProvider, MeetingProviderIntegrationStatus } from "@/types/meetingProvider";

type ProviderState = {
  status: MeetingProviderIntegrationStatus | null;
  loading: boolean;
  connecting: boolean;
  disconnecting: boolean;
  error: string | null;
  connectedNotice: boolean;
};

const providerMeta: Array<{
  provider: MeetingProvider;
  name: string;
  configVars: string[];
  connectedDetail: string;
  disconnectedDetail: string;
}> = [
  {
    provider: "zoom",
    name: "Zoom",
    configVars: ["ZOOM_CLIENT_ID", "ZOOM_CLIENT_SECRET", "ZOOM_REDIRECT_URI"],
    connectedDetail: "OAuth is active. Imported recordings can flow into OrbitPlan processing.",
    disconnectedDetail: "Connect Zoom to enable meeting import and webhook-driven recording ingestion.",
  },
  {
    provider: "teams",
    name: "Microsoft Teams",
    configVars: ["MICROSOFT_CLIENT_ID", "MICROSOFT_CLIENT_SECRET", "MICROSOFT_REDIRECT_URI"],
    connectedDetail: "OAuth is active. Teams payloads can be linked back to this account for import.",
    disconnectedDetail: "Connect Microsoft Teams to enable provider import and webhook-based meeting sync.",
  },
];

const createInitialProviderState = (): Record<MeetingProvider, ProviderState> => ({
  zoom: {
    status: null,
    loading: true,
    connecting: false,
    disconnecting: false,
    error: null,
    connectedNotice: false,
  },
  teams: {
    status: null,
    loading: true,
    connecting: false,
    disconnecting: false,
    error: null,
    connectedNotice: false,
  },
});

const popupFeatures = "popup=yes,width=640,height=720,left=120,top=120";

const isMeetingProvider = (value: unknown): value is MeetingProvider => value === "zoom" || value === "teams";

export default function IntegrationsPage() {
  const [providers, setProviders] = useState<Record<MeetingProvider, ProviderState>>(createInitialProviderState);
  const [jiraStatus, setJiraStatus] = useState<JiraIntegrationStatus | null>(null);
  const [jiraLoading, setJiraLoading] = useState(true);
  const oauthPollersRef = useRef<Partial<Record<MeetingProvider, number>>>({});

  const loadProviderStatus = async (provider: MeetingProvider, options?: { preserveNotice?: boolean }) => {
    setProviders((current) => ({
      ...current,
      [provider]: {
        ...current[provider],
        loading: true,
        error: null,
        connectedNotice: options?.preserveNotice ? current[provider].connectedNotice : false,
      },
    }));

    try {
      const status = await getMeetingProviderStatus(provider);
      setProviders((current) => ({
        ...current,
        [provider]: {
          ...current[provider],
          status,
          loading: false,
          error: null,
        },
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to load provider status.";
      setProviders((current) => ({
        ...current,
        [provider]: {
          ...current[provider],
          loading: false,
          error: message,
        },
      }));
    }
  };

  const stopOAuthWatcher = (provider: MeetingProvider) => {
    const intervalId = oauthPollersRef.current[provider];
    if (intervalId !== undefined) {
      window.clearInterval(intervalId);
      delete oauthPollersRef.current[provider];
    }
  };

  const finishSuccessfulConnection = (provider: MeetingProvider) => {
    stopOAuthWatcher(provider);
    setProviders((current) => ({
      ...current,
      [provider]: {
        ...current[provider],
        connecting: false,
        connectedNotice: true,
        error: null,
      },
    }));
    void loadProviderStatus(provider, { preserveNotice: true });
  };

  const startOAuthWatcher = (provider: MeetingProvider, popup: Window) => {
    stopOAuthWatcher(provider);
    let pollsRemaining = 90;
    let requestInFlight = false;

    oauthPollersRef.current[provider] = window.setInterval(async () => {
      if (requestInFlight) return;
      if (popup.closed) pollsRemaining = Math.min(pollsRemaining, 10);
      if (pollsRemaining <= 0) {
        stopOAuthWatcher(provider);
        setProviders((current) => ({
          ...current,
          [provider]: {
            ...current[provider],
            connecting: false,
          },
        }));
        return;
      }

      pollsRemaining -= 1;
      requestInFlight = true;
      try {
        const status = await getMeetingProviderStatus(provider);
        if (status.connected) {
          setProviders((current) => ({
            ...current,
            [provider]: {
              ...current[provider],
              status,
              loading: false,
              connecting: false,
              connectedNotice: true,
              error: null,
            },
          }));
          stopOAuthWatcher(provider);
          return;
        }

        setProviders((current) => ({
          ...current,
          [provider]: {
            ...current[provider],
            status,
            loading: false,
            error: null,
          },
        }));
      } catch {
        // Keep polling through transient auth/callback timing.
      } finally {
        requestInFlight = false;
      }
    }, 1500);
  };

  useEffect(() => {
    void Promise.all(providerMeta.map(({ provider }) => loadProviderStatus(provider)));

    const loadJiraStatus = async () => {
      try {
        setJiraStatus(await getJiraStatus());
      } catch {
        setJiraStatus(null);
      } finally {
        setJiraLoading(false);
      }
    };

    void loadJiraStatus();
  }, []);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const payload = event.data as { type?: string; provider?: unknown };
      if (payload?.type !== "orbitplan:meeting-provider-connected" || !isMeetingProvider(payload.provider)) return;
      finishSuccessfulConnection(payload.provider);
    };

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  useEffect(
    () => () => {
      for (const provider of Object.keys(oauthPollersRef.current) as MeetingProvider[]) {
        stopOAuthWatcher(provider);
      }
    },
    [],
  );

  const handleConnect = async (provider: MeetingProvider) => {
    setProviders((current) => ({
      ...current,
      [provider]: {
        ...current[provider],
        connecting: true,
        error: null,
        connectedNotice: false,
      },
    }));

    try {
      const url = await getMeetingProviderAuthUrl(provider);
      const popup = window.open(url, `${provider}-oauth`, popupFeatures);
      if (!popup) {
        throw new ApiRequestError("OAuth popup was blocked. Allow popups and retry.", { status: 400 });
      }
      startOAuthWatcher(provider, popup);
    } catch (error) {
      stopOAuthWatcher(provider);
      const message = error instanceof Error ? error.message : "Unable to start provider connection.";
      setProviders((current) => ({
        ...current,
        [provider]: {
          ...current[provider],
          connecting: false,
          error: message,
        },
      }));
    }
  };

  const handleDisconnect = async (provider: MeetingProvider) => {
    setProviders((current) => ({
      ...current,
      [provider]: {
        ...current[provider],
        disconnecting: true,
        error: null,
        connectedNotice: false,
      },
    }));

    try {
      await disconnectMeetingProvider(provider);
      await loadProviderStatus(provider);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to disconnect provider.";
      setProviders((current) => ({
        ...current,
        [provider]: {
          ...current[provider],
          disconnecting: false,
          error: message,
        },
      }));
    }
  };

  return (
    <RequireAuth>
      <AppShell>
        <div className="space-y-6">
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 backdrop-blur-md fade-in">
            <p className="text-xs uppercase tracking-[0.16em] text-[var(--text-muted)]">Connections</p>
            <h2 className="mt-1 text-2xl font-bold">Integrations</h2>
            <p className="mt-2 max-w-2xl text-sm text-[var(--text-secondary)]">
              Connect meeting systems that feed OrbitPlan and confirm whether the API is actually configured for each one.
            </p>
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            {providerMeta.map((item) => {
              const providerState = providers[item.provider];
              const status = providerState.status;
              const tone = !status?.configured ? "warning" : status.connected ? "success" : "neutral";
              const label = providerState.loading
                ? "Checking..."
                : !status?.configured
                  ? "Not Configured"
                  : status.connected
                    ? "Connected"
                    : "Ready To Connect";

              return (
                <Card
                  key={item.provider}
                  title={item.name}
                  subtitle="Meeting provider"
                  rightSlot={<StatusPill label={label} tone={tone} />}
                >
                  <div className="space-y-4">
                    <p className="text-sm text-[var(--text-secondary)]">
                      {status?.connected ? item.connectedDetail : item.disconnectedDetail}
                    </p>

                    {providerState.connectedNotice && (
                      <div className="rounded-xl border border-[rgba(56,255,179,0.35)] bg-[rgba(56,255,179,0.1)] p-3">
                        <p className="text-sm font-semibold text-[var(--text-primary)]">{item.name} connected successfully</p>
                      </div>
                    )}

                    {status?.externalEmail && (
                      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-strong)] px-3 py-2">
                        <p className="text-xs uppercase tracking-[0.12em] text-[var(--text-muted)]">Connected account</p>
                        <p className="mt-1 text-sm text-[var(--text-primary)]">{status.externalEmail}</p>
                      </div>
                    )}

                    {!providerState.loading && status && !status.configured && (
                      <p className="text-sm text-[var(--text-secondary)]">
                        Set {item.configVars.map((variable) => `\`${variable}\``).join(", ")} in the API env first.
                      </p>
                    )}

                    {providerState.error && (
                      <div className="rounded-xl border border-[rgba(255,106,106,0.3)] bg-[rgba(255,106,106,0.08)] p-3">
                        <p className="text-sm text-[var(--text-primary)]">{providerState.error}</p>
                      </div>
                    )}

                    <div className="flex flex-wrap gap-3">
                      <Button
                        variant="secondary"
                        onClick={() => void loadProviderStatus(item.provider, { preserveNotice: true })}
                        disabled={providerState.loading || providerState.connecting || providerState.disconnecting}
                      >
                        Refresh
                      </Button>

                      {status?.configured && !status.connected && (
                        <Button
                          onClick={() => void handleConnect(item.provider)}
                          disabled={providerState.loading || providerState.connecting}
                        >
                          {providerState.connecting ? "Connecting..." : `Connect ${item.name}`}
                        </Button>
                      )}

                      {status?.configured && status.connected && (
                        <Button
                          variant="ghost"
                          onClick={() => void handleDisconnect(item.provider)}
                          disabled={providerState.loading || providerState.disconnecting}
                        >
                          {providerState.disconnecting ? "Disconnecting..." : "Disconnect"}
                        </Button>
                      )}
                    </div>
                  </div>
                </Card>
              );
            })}

            <Card
              title="Jira"
              subtitle="Execution target"
              rightSlot={
                <StatusPill
                  label={jiraLoading ? "Checking..." : jiraStatus?.connected ? "Connected" : jiraStatus?.configured ? "Ready To Connect" : "Not Configured"}
                  tone={!jiraStatus?.configured ? "warning" : jiraStatus?.connected ? "success" : "neutral"}
                />
              }
            >
              <p className="text-sm text-[var(--text-secondary)]">
                Jira export is already wired from meeting review. This page now shows live provider status for Zoom and Teams; Jira connection and export still happen from the review flow.
              </p>
            </Card>
          </div>
        </div>
      </AppShell>
    </RequireAuth>
  );
}
