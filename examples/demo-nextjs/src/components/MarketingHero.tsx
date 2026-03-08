import { t } from "@/i18n";
export function MarketingHero() {
  return <section>
      <p>{t("home.marketinghero.p.ship_everywhere")}</p>
      <h1>{t("home.marketinghero.h1.no_tax")}</h1>
      <p>{t("home.marketinghero.p.flow_translations")}</p>
      <div>
        <button>{t("home.marketinghero.button.book_demo")}</button>
        <button>{t("home.marketinghero.button.view_cli")}</button>
      </div>
    </section>;
}
