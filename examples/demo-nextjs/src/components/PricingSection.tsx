import { t } from "@/i18n";
export function PricingSection() {
  return <section>
      <h2>{t("pricingsection.pick_your_rollout_plan")}</h2>
      <article>
        <h3>{t("pricingsection.starter")}</h3>
        <p>{t("pricingsection.best_for_teams_shipping_their_first_mult")}</p>
        <button>{t("pricingsection.start_free_trial")}</button>
      </article>
      <article>
        <h3>{t("pricingsection.scale")}</h3>
        <p>{t("pricingsection.ideal_for_product_organizations_managing")}</p>
        <button>{t("pricingsection.talk_to_sales")}</button>
      </article>
    </section>;
}
