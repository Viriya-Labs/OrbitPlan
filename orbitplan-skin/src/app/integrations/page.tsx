"use client";

import { RequireAuth } from "@/components/auth/require-auth";
import { AppShell } from "@/components/layout/app-shell";
import { Card } from "@/components/ui/card";

const integrationCards = [
  {
    name: "Zoom",
    detail: "Native meeting import foundation is in place. OAuth and webhook setup are next.",
  },
  {
    name: "Microsoft Teams",
    detail: "Provider sync foundation is ready. Microsoft app setup and subscription wiring come next.",
  },
  {
    name: "Jira",
    detail: "Connected ticket export flow is already available from meeting review.",
  },
];

export default function IntegrationsPage() {
  return (
    <RequireAuth>
      <AppShell>
        <div className="space-y-6">
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 backdrop-blur-md fade-in">
            <p className="text-xs uppercase tracking-[0.16em] text-[var(--text-muted)]">Connections</p>
            <h2 className="mt-1 text-2xl font-bold">Integrations</h2>
            <p className="mt-2 max-w-2xl text-sm text-[var(--text-secondary)]">
              Manage external systems that feed OrbitPlan or receive action plans after meetings.
            </p>
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            {integrationCards.map((card) => (
              <Card key={card.name} title={card.name} subtitle="Integration status">
                <p className="text-sm text-[var(--text-secondary)]">{card.detail}</p>
              </Card>
            ))}
          </div>
        </div>
      </AppShell>
    </RequireAuth>
  );
}
