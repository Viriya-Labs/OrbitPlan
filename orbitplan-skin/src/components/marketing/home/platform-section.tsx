import { Reveal } from "@/components/aceternity/reveal";
import { MovingBorderLink } from "@/components/aceternity/moving-border-link";
import { Card } from "@/components/ui/card";
import { MarketingSection } from "./marketing-section";
import { homeAsyncPipelineSteps } from "./content";

export function PlatformSection() {
  return (
    <MarketingSection className="lg:grid-cols-[1.15fr_0.85fr]">
      <Reveal>
        <Card title="Async processing that scales" subtitle="No more waiting on long requests.">
          <div className="space-y-3 text-sm text-[var(--text-secondary)]">
            <p>
              Meeting processing runs in the background. OrbitPlan returns instantly, then you can review results when they’re
              ready.
            </p>
            <ul className="space-y-2">
              {homeAsyncPipelineSteps.map((step, index) => (
                <li key={step}>
                  {index + 1}. {step}
                </li>
              ))}
            </ul>
          </div>
        </Card>
      </Reveal>

      <Reveal delay={0.08}>
        <Card title="Connect your stack" subtitle="Zoom + Teams in, Jira out.">
          <div className="space-y-3 text-sm text-[var(--text-secondary)]">
            <p>OrbitPlan supports provider connections and webhooks to import meetings automatically.</p>
            <div className="flex flex-wrap gap-3 pt-1">
              <MovingBorderLink href="/integrations">Explore Integrations</MovingBorderLink>
              <MovingBorderLink href="/upload">Try a sample upload</MovingBorderLink>
            </div>
          </div>
        </Card>
      </Reveal>
    </MarketingSection>
  );
}
