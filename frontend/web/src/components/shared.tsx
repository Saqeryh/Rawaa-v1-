import { Link } from "react-router-dom";
import { LANGS, LANG_META, useI18n } from "../i18n";
import { Badge } from "./ui";
import type { Assessment, RiskKey } from "../api/types";
import type { ConnectionState } from "../hooks/useApi";

export { ThemeToggle } from "./ui";
export function LanguageSwitcher() {
  const { lang, setLang, t } = useI18n();
  return (
    <div className="lang-switch" role="group" aria-label={t("common.language")}>
      {LANGS.map((l) => (
        <button key={l} type="button" aria-pressed={lang === l} lang={l} onClick={() => setLang(l)}>{LANG_META[l].label}</button>
      ))}
    </div>
  );
}

export function DemoBanner() {
  const { t } = useI18n();
  return <div className="demo-banner" role="note">{t("notice.demo")}</div>;
}

export function Brand({ to = "/" }: { to?: string }) {
  const { t } = useI18n();
  return (
    <Link to={to} className="brand" aria-label={t("nav.toLanding")}>
      <img src="/logo.png" alt="" width={88} height={44} onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
      <span>{t("app.name")}</span>
    </Link>
  );
}

const RISK_VARIANT: Record<RiskKey, { v: "ok" | "warn" | "orange" | "danger"; g: string; bg: string }> = {
  low_risk: { v: "ok", g: "●", bg: "risk-bg-0" },
  rising_activity: { v: "warn", g: "▲", bg: "risk-bg-1" },
  pre_thrombotic_state: { v: "orange", g: "◆", bg: "risk-bg-2" },
  critical_thrombosis_risk: { v: "danger", g: "■", bg: "risk-bg-3" },
};
export const riskBg = (k: RiskKey | null | undefined) => (k ? RISK_VARIANT[k].bg : "risk-bg-n");

/** Category is always conveyed by text + glyph, never colour alone. Null assessment / insufficient data are explicit states. */
export function RiskBadge({ risk }: { risk: Assessment | null | undefined }) {
  const { t } = useI18n();
  if (!risk) return <Badge glyph="○">{t("risk.unavailable")}</Badge>;
  if (risk.status !== "ok" || !risk.category_key) return <Badge glyph="○" title={risk.details.reason ? t(`risk.reason.${risk.details.reason}`) : undefined}>{t("risk.insufficient")}</Badge>;
  const m = RISK_VARIANT[risk.category_key];
  return <Badge variant={m.v} glyph={m.g}>{t(`risk.${risk.category_key}`)}</Badge>;
}

export function ConnectionIndicator({ state, lastUpdate }: { state: ConnectionState; lastUpdate?: number | null }) {
  const { t, fmt } = useI18n();
  return (
    <span className="row small muted" role="status" aria-live="polite" style={{ gap: 6 }}>
      <span className={`live-dot ${state}`} aria-hidden="true" />
      {t(`status.connection.${state}`)}
      {lastUpdate ? <span className="num">· {t("common.lastUpdate")}: {fmt.time(lastUpdate)}</span> : null}
    </span>
  );
}
