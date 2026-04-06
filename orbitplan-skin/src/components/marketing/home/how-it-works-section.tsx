import { homeHowItWorks } from "./content";
import { RevealedCardGrid } from "./revealed-card-grid";

export function HowItWorksSection() {
  return (
    <RevealedCardGrid items={homeHowItWorks} gridClassName="lg:grid-cols-3" baseDelay={0.06} delayStep={0.06} />
  );
}
