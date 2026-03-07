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
          Replace manual string hunts with a repeatable pipeline that keeps
          components and locale files in sync.
        </p>
        <button>Start global rollout</button>
      </section>
    </main>
  );
}
