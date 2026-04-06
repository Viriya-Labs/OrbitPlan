import { Reveal } from "@/components/aceternity/reveal";
import { MovingBorderLink } from "@/components/aceternity/moving-border-link";
import { MarketingSection } from "./marketing-section";

export function FinalCtaSection() {
  return (
    <MarketingSection topSpacing="lg">
      <Reveal>
        <div className="relative overflow-hidden rounded-3xl border border-[var(--border)] bg-[linear-gradient(180deg,rgba(255,255,255,0.04)_0%,rgba(255,255,255,0.02)_100%)] p-8 shadow-[var(--shadow-soft)] backdrop-blur-md md:p-10">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(56,255,179,0.10),transparent_60%)]" />
          <div className="relative z-10 flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-[var(--text-muted)]">OrbitPlan</p>
              <h3 className="mt-2 text-2xl font-bold md:text-3xl">
                Make every meeting produce a <span className="brand-gradient">clear plan</span>.
              </h3>
              <p className="mt-2 max-w-2xl text-sm text-[var(--text-secondary)]">
                Start with an upload, or connect Zoom/Teams to capture outcomes automatically. Review, approve, and keep execution
                moving.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <MovingBorderLink href="/upload">Get started</MovingBorderLink>
              <MovingBorderLink href="/login">Admin login</MovingBorderLink>
            </div>
          </div>
        </div>
      </Reveal>
    </MarketingSection>
  );
}
