import type { Assessment } from "../api/types";
import { useI18n } from "../i18n";
import { useConfig } from "../hooks/useConfig";
import { Badge, Card } from "./ui";
import { RiskBadge } from "./shared";

/** Explains a classification. Shows provenance; never shows confidence/accuracy (none exists). */
export function RiskPanel({ risk }: { risk: Assessment | null | undefined }) {
  const { t, fmt, name } = useI18n();
  const { biomarker } = useConfig();
  if (!risk) return <Card title={t("risk.title")}><p className="muted">{t("risk.unavailable")}</p><div className="notice" style={{ marginTop: 12 }}>{t("notice.riskDemo")}</div></Card>;
  const d = risk.details;
  const insufficient = risk.status !== "ok";
  return (
    <Card title={t("risk.title")} actions={<RiskBadge risk={risk} />}>
      <div className="stack">
        <p>{t(d.explanation_key)}{insufficient && d.reason ? ` ${t(`risk.reason.${d.reason}`)}` : ""}</p>
        <div className="row small">
          <Badge variant="info">{t(`risk.source.${risk.source}`)}</Badge>
          <span className="muted">{risk.model_version}</span>
          <span className="muted">· {t("risk.computedAt")}: <span className="num">{fmt.dateTime(risk.computed_at)}</span></span>
        </div>
        <div className="row small"><Badge variant={d.data_quality.overall === "ok" ? "ok" : d.data_quality.overall === "degraded" ? "warn" : "danger"}>{t(`risk.quality.${d.data_quality.overall}`)}</Badge></div>
        {d.contributions.length > 0 && (
          <div className="table-wrap">
            <table>
              <caption className="sr-only">{t("risk.contributions")}</caption>
              <thead><tr><th>{t("risk.contributions")}</th><th>{t("risk.change")}</th><th>{t("common.details")}</th></tr></thead>
              <tbody>
                {d.contributions.map((c) => {
                  const cfg = biomarker(c.biomarker_id);
                  const q = d.data_quality.markers[c.biomarker_id];
                  return (
                    <tr key={c.biomarker_id}>
                      <td>{cfg ? `${name(cfg.names)} (${cfg.abbreviation})` : c.biomarker_id}</td>
                      <td className="num">{c.relative_change === null ? t("common.noReading") : fmt.percent(c.relative_change)}</td>
                      <td className="xs muted">
                        {c.used_in_rule ? t("risk.usedInRule") : t("risk.supportingOnly")}
                        {q && <> · <span className="num">{t("risk.validPoints", { valid: fmt.number(q.valid_points, 0), total: fmt.number(q.window_points, 0) })}</span></>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <div className="notice">{t("notice.riskDemo")} {t("risk.noConfidence")}</div>
      </div>
    </Card>
  );
}
