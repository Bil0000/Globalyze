import { t } from "@/i18n";
export function MarketingHero() {
  return <section>
      <p>{t("marketinghero.ship_once_launch_everywhere")}</p>
      <h1>{t("marketinghero.global_releases_without_the_localization")}</h1>
      <p>{t("marketinghero.detect_hardcoded_strings_refactor_jsx_au")}</p>
      <div>
        <button>{t("marketinghero.book_a_demo")}</button>
        <button>{t("marketinghero.view_cli_workflow")}</button>
      </div>
    </section>;
}
