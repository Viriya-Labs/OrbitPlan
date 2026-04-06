import { Reveal } from "@/components/aceternity/reveal";
import { Card } from "@/components/ui/card";
import { MarketingSection } from "./marketing-section";
import { homeProofStats } from "./content";

export function ProofSection() {
  return (
    <MarketingSection>
      <Reveal>
        <Card title="Built for teams that want momentum" subtitle="A clean chain from thinking to doing.">
          <div className="flex flex-wrap gap-3">
            {homeProofStats.map((item) => (
              <div
                key={item.label}
                className="rounded-2xl border border-[rgba(120,145,255,0.16)] bg-[rgba(255,255,255,0.03)] px-4 py-3"
              >
                <p className="text-xs uppercase tracking-[0.14em] text-[var(--text-muted)]">{item.label}</p>
                <p className="mt-1 text-lg font-semibold text-[var(--text-primary)]">{item.value}</p>
              </div>
            ))}
          </div>
        </Card>
      </Reveal>
    </MarketingSection>
  );
}
