import { t } from "@/i18n";
import { MarketingHero } from "@/components/MarketingHero";
import { PricingSection } from "@/components/PricingSection";
export default function HomePage() {
  return <main>
      <MarketingHero />
      <PricingSection />
      <section>
        <h2>{t("common.why_teams_adopt_globalyze")}</h2>
        <p>{t("common.replace_manual_string_hunts_with_a_repea")}</p>
        <button>{t("common.start_global_rollout")}</button>
      </section>
    </main>;
}
