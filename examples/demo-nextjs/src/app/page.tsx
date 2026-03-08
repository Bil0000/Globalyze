import { t } from "@/i18n";
import { MarketingHero } from "@/components/MarketingHero";
import { PricingSection } from "@/components/PricingSection";
export default function HomePage() {
  return <main>
      <MarketingHero />
      <PricingSection />
      <section>
        <h2>{t("home.homepage.h2.why_adopt")}</h2>
        <p>{t("home.homepage.p.sync_pipeline")}</p>
        <button>{t("home.homepage.button.start_rollout")}</button>
      </section>
    </main>;
}
