import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../api/endpoints";
import { useSession } from "../../auth/session";
import { useI18n } from "../../i18n";
import { useApi } from "../../hooks/useApi";
import { useAction } from "../../hooks/useAction";
import { LanguageSwitcher } from "../../components/shared";
import { Badge, Card, ErrorState, LoadingBlock } from "../../components/ui";
import { usePatient } from "./context";

export default function SettingsPage() {
  const { t, lang } = useI18n();
  const { session, signOut } = useSession();
  const nav = useNavigate();
  const tok = session?.token ?? null;
  const { patient: p } = usePatient();
  const prefs = useApi(() => api.preferences(tok, p.id), [tok, p.id]);
  const save = useAction();
  const [saved, setSaved] = useState(false);

  const update = async (body: Parameters<typeof api.updatePreferences>[2]) => {
    setSaved(false);
    const r = await save.run(() => api.updatePreferences(tok, p.id, body));
    if (r) { setSaved(true); prefs.refresh(); }
  };
  // A user-driven language change (switcher) is persisted for this patient. The local choice always wins;
  // the first render is skipped so simply opening Settings never writes anything.
  const prevLang = useRef(lang);
  useEffect(() => {
    if (prevLang.current === lang) return;
    prevLang.current = lang;
    void api.updatePreferences(tok, p.id, { language: lang }).then(() => setSaved(true)).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang]);

  return (
    <>
      <h1>{t("settings.title")}</h1>
      <Card title={t("settings.profile")}>
        <dl style={{ margin: 0, display: "grid", gridTemplateColumns: "auto 1fr", gap: "6px 16px" }}>
          <dt className="muted">{t("common.name")}</dt><dd style={{ margin: 0 }}>{p.display_name}</dd>
          <dt className="muted">{t("detail.patientId")}</dt><dd className="mono" style={{ margin: 0 }}>{p.id}</dd>
          <dt className="muted">{t("common.age")}</dt><dd className="num" style={{ margin: 0 }}>{p.age ?? "—"}</dd>
        </dl>
        <p className="xs muted" style={{ marginTop: 8 }}>{t("settings.profileNote")}</p>
      </Card>
      <Card title={t("settings.language")}><LanguageSwitcher /></Card>
      <Card title={t("settings.notifications")}>
        {prefs.loading && !prefs.data && <LoadingBlock rows={2} />}
        {prefs.error && !prefs.data && <ErrorState error={prefs.error} onRetry={prefs.reload} />}
        {prefs.data && (
          <div>
            <label className="toggle"><span>{t("settings.notifyAlerts")}</span>
              <input type="checkbox" checked={prefs.data.notify_alerts} onChange={(e) => update({ notify_alerts: e.target.checked })} /></label>
            <label className="toggle"><span>{t("settings.notifyDevice")}</span>
              <input type="checkbox" checked={prefs.data.notify_device} onChange={(e) => update({ notify_device: e.target.checked })} /></label>
            <div aria-live="polite" className="small muted" style={{ marginTop: 8 }}>{saved ? t("settings.saved") : ""}</div>
          </div>
        )}
        {save.error ? <ErrorState error={save.error} /> : null}
      </Card>
      <Card title={t("settings.wearable")}>
        <div className="stack-sm">
          {p.devices.map((d) => <div key={d.id} className="row-between small"><span>{t(`device.kind.${d.kind}`)}</span><Badge variant={d.status === "connected" ? "ok" : "danger"}>{t(`status.device.${d.status}`)}</Badge></div>)}
          <p className="xs muted">{t("settings.wearableNote")}</p>
        </div>
      </Card>
      <Card title={t("settings.privacy")}><p className="small">{t("settings.privacyText")}</p></Card>
      <button className="btn danger" onClick={signOut}>{t("settings.logout")}</button>
    </>
  );
}
