import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { ReactNode } from "react";
import type { Assessment, DeviceHistoryItem, Reading, Vital } from "../api/types";
import { useI18n } from "../i18n";
import { riskBg } from "./shared";
import { EmptyState } from "./ui";

interface Pt { t: number; v: number | null }

/** Line chart of one measurement. Missing readings are gaps (null), never zero. */
export function TrendChart({ points, unit, color, label }: { points: (Reading | Vital)[]; unit: string; color: string; label: string }) {
  const { t, fmt, dir } = useI18n();
  const data: Pt[] = points.map((p) => ({ t: fmt.toMs(p.measured_at), v: p.quality === "missing" ? null : p.value }));
  const valid = data.filter((d) => d.v !== null);
  const missing = data.length - valid.length;
  if (!data.length) return <EmptyState>{t("bio.noHistory")}</EmptyState>;
  if (!valid.length) return <EmptyState>{t("charts.noData")}</EmptyState>;
  const rtl = dir === "rtl";
  return (
    <figure style={{ margin: 0 }} aria-label={`${label} (${unit})`}>
      <div className="chart-box">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid stroke="#ece9f7" vertical={false} />
            <XAxis dataKey="t" type="number" scale="time" domain={["dataMin", "dataMax"]} reversed={rtl}
              tickFormatter={(ms) => fmt.time(ms as number)} tick={{ fontSize: 12 }} minTickGap={32} />
            <YAxis orientation={rtl ? "right" : "left"} width={48} tick={{ fontSize: 12 }} domain={["auto", "auto"]}
              tickFormatter={(v) => fmt.number(v as number, 2)} />
            <Tooltip formatter={(v: unknown) => [`${fmt.number(v as number)} ${unit}`, label]}
              labelFormatter={(ms) => fmt.dateTime(new Date(ms as number).toISOString())} />
            <Line type="monotone" dataKey="v" stroke={color} strokeWidth={2.5} dot={{ r: 2 }} connectNulls={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <figcaption className="xs muted">
        {t("bio.gapsNote")} {missing > 0 && <span className="num">({t("charts.missingPoint")}: {fmt.number(missing, 0)})</span>}
      </figcaption>
    </figure>
  );
}

export interface DistRow { key: string; label: string; value: number; color?: string }

/** Horizontal bar chart for categorical counts (risk distribution, age buckets).
 * Axis tick labels are hidden (the accessible text list below carries every label + count),
 * so the chart can never duplicate a label elsewhere on the page. Missing data is never drawn as zero. */
export function DistributionChart({ rows, label, list = true, empty }: { rows: DistRow[]; label: string; list?: boolean; empty?: ReactNode }) {
  const { t, fmt, dir } = useI18n();
  const rtl = dir === "rtl";
  if (!rows.length) return <EmptyState>{empty ?? t("charts.noData")}</EmptyState>;
  return (
    <figure className="dist" aria-label={label}>
      <div className="chart-box" aria-hidden="true">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} layout="vertical" margin={{ top: 8, right: 16, bottom: 4, left: 4 }}>
            <CartesianGrid stroke="#ece9f7" horizontal={false} />
            <XAxis type="number" hide allowDecimals={false} />
            <YAxis type="category" dataKey="label" hide orientation={rtl ? "right" : "left"} width={132} />
            <Tooltip cursor={{ fill: "rgba(138,116,249,.08)" }} formatter={(v: unknown) => [fmt.number(v as number, 0), label]} />
            <Bar dataKey="value" radius={[0, 4, 4, 0]} isAnimationActive={false}>
              {rows.map((r) => <Cell key={r.key} fill={r.color ?? "#8a74f9"} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      {list && (
        <figcaption className="dist-list">
          {rows.map((r) => (
            <span key={r.key} className="dist-row xs muted">
              <i className="dist-dot" style={{ background: r.color ?? "#8a74f9" }} aria-hidden="true" />
              <span>{r.label}</span><strong className="num">{fmt.number(r.value, 0)}</strong>
            </span>
          ))}
        </figcaption>
      )}
    </figure>
  );
}

/** Colour-coded strip of stored risk assessments; grey = insufficient data. Text legend + per-block titles. */
export function RiskTimeline({ items }: { items: Assessment[] }) {
  const { t, fmt } = useI18n();
  if (!items.length) return <EmptyState>{t("charts.noData")}</EmptyState>;
  const shown = items.slice(-72);
  const label = (a: Assessment) => (a.status === "ok" && a.category_key ? t(`risk.${a.category_key}`) : t("risk.insufficient"));
  const legend: [string, string][] = [["risk-bg-0", t("risk.low_risk")], ["risk-bg-1", t("risk.rising_activity")], ["risk-bg-2", t("risk.pre_thrombotic_state")], ["risk-bg-3", t("risk.critical_thrombosis_risk")], ["risk-bg-n", t("risk.insufficient")]];
  return (
    <div className="stack-sm">
      <div className="strip" role="img" aria-label={`${t("risk.history")}: ${label(shown[shown.length - 1])}`}>
        {shown.map((a) => <span key={a.id} className={riskBg(a.status === "ok" ? a.category_key : null)} title={`${fmt.dateTime(a.computed_at)} — ${label(a)}`} />)}
      </div>
      <div className="legend">{legend.map(([c, l]) => <span key={c}><i className={c} />{l}</span>)}</div>
    </div>
  );
}

/** Per-device connected/disconnected timeline built from the status log. */
export function ConnectionTimeline({ history, deviceKinds }: { history: DeviceHistoryItem[]; deviceKinds: string[] }) {
  const { t, fmt } = useI18n();
  if (!history.length) return <EmptyState>{t("device.noHistory")}</EmptyState>;
  const start = Math.min(...history.map((h) => fmt.toMs(h.ts)));
  const end = Date.now();
  const span = Math.max(1, end - start);
  return (
    <div className="stack-sm">
      {deviceKinds.map((kind) => {
        const logs = history.filter((h) => h.kind === kind).sort((a, b) => fmt.toMs(a.ts) - fmt.toMs(b.ts));
        const segs = logs.map((l, i) => {
          const from = fmt.toMs(l.ts); const to = i + 1 < logs.length ? fmt.toMs(logs[i + 1].ts) : end;
          return { status: l.status, w: Math.max(0.5, ((to - from) / span) * 100), from };
        });
        return (
          <div key={kind}>
            <div className="small" style={{ marginBottom: 4 }}>{t(`device.kind.${kind}`)}</div>
            <div className="seg-bar" role="img" aria-label={`${t(`device.kind.${kind}`)}: ${logs.length ? t(`status.device.${logs[logs.length - 1].status}`) : ""}`}>
              {segs.map((s, i) => <span key={i} className={s.status === "connected" ? "conn-up" : "conn-down"} style={{ width: `${s.w}%` }} title={`${fmt.dateTime(new Date(s.from).toISOString())} — ${t(`status.device.${s.status}`)}`} />)}
            </div>
          </div>
        );
      })}
      <div className="legend"><span><i className="conn-up" />{t("status.device.connected")}</span><span><i className="conn-down" />{t("status.device.disconnected")}</span></div>
    </div>
  );
}

/** Share of valid vs missing readings per biomarker in the loaded range (monitoring / data availability). */
export function AvailabilityBars({ rows }: { rows: { id: string; label: string; valid: number; total: number }[] }) {
  const { t, fmt } = useI18n();
  return (
    <div className="stack-sm">
      {rows.map((r) => {
        const pct = r.total ? (r.valid / r.total) * 100 : 0;
        return (
          <div key={r.id}>
            <div className="row-between small"><span>{r.label}</span><span className="num muted">{r.total ? t("risk.validPoints", { valid: fmt.number(r.valid, 0), total: fmt.number(r.total, 0) }) : t("common.noReading")}</span></div>
            <div className="seg-bar" role="img" aria-label={`${r.label}: ${Math.round(pct)}%`}><span className="conn-up" style={{ width: `${pct}%` }} /></div>
          </div>
        );
      })}
    </div>
  );
}
