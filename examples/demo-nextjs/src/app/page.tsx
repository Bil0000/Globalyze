import { MarketingHero } from "@/components/MarketingHero";
import { PricingSection } from "@/components/PricingSection";

export default function HomePage() {
  return (
    <main>
      <MarketingHero />
      <PricingSection />
      <section>
        <h2>Why teams adopt Globalyze</h2>
        <p>
          Replace manual string hunts with a repeatable localization workflow.
        </p>
        <button>Start global rollout</button>
      </section>
    </main>
  );
}
