import { Reveal } from "@/components/aceternity/reveal";
import { Card } from "@/components/ui/card";
import { MarketingSection } from "./marketing-section";
import type { FeatureBlurb } from "./content";

type RevealedCardGridProps = {
  items: FeatureBlurb[];
  /** Tailwind grid column classes */
  gridClassName: string;
  baseDelay?: number;
  delayStep?: number;
  topSpacing?: "none" | "md" | "lg";
};

export function RevealedCardGrid({
  items,
  gridClassName,
  baseDelay = 0.06,
  delayStep = 0.06,
  topSpacing = "md",
}: RevealedCardGridProps) {
  return (
    <MarketingSection className={gridClassName} topSpacing={topSpacing}>
      {items.map((item, index) => (
        <Reveal key={item.title} delay={baseDelay + index * delayStep}>
          <Card title={item.title} subtitle={item.subtitle}>
            <p className="text-sm text-[var(--text-secondary)]">{item.body}</p>
          </Card>
        </Reveal>
      ))}
    </MarketingSection>
  );
}
