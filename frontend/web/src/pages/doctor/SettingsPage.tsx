// Doctor settings — client-side preferences that genuinely exist: theme (persisted in
// localStorage) and language (persisted by the i18n provider), plus the account/privacy
// disclosure. There is no doctor-preferences endpoint in this backend, so nothing else
// is offered and nothing is faked.

import { useSession } from "../../auth/session";
import { useI18n } from "../../i18n";
import { LanguageSwitcher } from "../../components/shared";
import { Card, ThemeToggle } from "../../components/ui";

export default function SettingsPage() {
  const { t } = useI18n();
  const { signOut } = useSession();
  return (
    <>
      <div className="topbar"><h1>{t("settings.title")}</h1></div>
      <div className="grid-2">
        <Card title={t("settings.appearance")}>
          <div className="row-between">
            <span>{t("settings.theme")}</span>
            <ThemeToggle />
          </div>
        </Card>
        <Card title={t("settings.language")}><LanguageSwitcher /></Card>
        <Card title={t("settings.account")}>
          <dl style={{ margin: 0, display: "grid", gridTemplateColumns: "auto 1fr", gap: "6px 16px" }}>
            <dt className="muted">{t("settings.role")}</dt><dd style={{ margin: 0 }}>{t("settings.roleDoctor")}</dd>
          </dl>
          <p className="xs muted" style={{ marginTop: 8 }}>{t("settings.demoNote")}</p>
        </Card>
        <Card title={t("settings.privacy")}><p className="small">{t("settings.privacyText")}</p></Card>
      </div>
      <button className="btn danger" onClick={signOut}>{t("settings.logout")}</button>
    </>
  );
}
