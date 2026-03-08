import { t } from "@/i18n";
export function PricingSection() {
  return <section>
      <h2>{t("home.pricingsection.h2.rollout_plan")}</h2>
      <article>
        <h3>{t("home.pricingsection.h3.starter")}</h3>
        <p>{t("home.pricingsection.p.starter_desc")}</p>
        <button>{t("home.pricingsection.button.start_trial")}</button>
      </article>
      <article>
        <h3>{t("home.pricingsection.h3.scale")}</h3>
        <p>{t("home.pricingsection.p.scale_desc")}</p>
        <button>{t("home.pricingsection.button.talk_sales")}</button>
        <button>{t("home.pricingsection.button.contact_support")}</button>
      </article>
    </section>;
}
