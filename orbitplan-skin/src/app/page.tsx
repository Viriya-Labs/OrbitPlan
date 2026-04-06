import { AppShell } from "@/components/layout/app-shell";
import { MarketingHero } from "@/components/marketing/hero";
import {
  FeaturesSection,
  FinalCtaSection,
  HowItWorksSection,
  PlatformSection,
  ProofSection,
} from "@/components/marketing/home";

export default function Home() {
  return (
    <AppShell>
      <MarketingHero />
      <ProofSection />
      <HowItWorksSection />
      <FeaturesSection />
      <PlatformSection />
      <FinalCtaSection />
    </AppShell>
  );
}
