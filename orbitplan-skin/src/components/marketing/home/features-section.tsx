import { homeFeatureHighlights } from "./content";
import { RevealedCardGrid } from "./revealed-card-grid";

export function FeaturesSection() {
  return (
    <RevealedCardGrid
      items={homeFeatureHighlights}
      gridClassName="md:grid-cols-3"
      baseDelay={0.08}
      delayStep={0.06}
    />
  );
}
