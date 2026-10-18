import { useMemo, type ReactNode } from "react";
import { api } from "../api/endpoints";
import type { Assessment, DeviceHistoryItem, PatientDetail, Reading } from "../api/types";
import { useSession } from "../auth/session";
import { useI18n } from "../i18n";
import { useApi } from "../hooks/useApi";
import { useConfig } from "../hooks/useConfig";
import { Card, EmptyState, LoadingBlock } from "./ui";

const WINDOW_MS = 24 * 3600_000;
const RISK_RANK: Record<string, number> = { low_risk: 0, rising_activity: 1, pre_thrombotic_state: 2, critical_thrombosis_risk: 3 };
const riskLabel = (a: Assessment) => (a.status === "ok" && a.category_key ? a.category_key : "insufficient_data");

/**
 * Daily Analysis: last-24-hours summary computed in the browser from the existing API records
 * (biomarker history with since_hours=24, risk history, device status history). Nothing is invented;
 * missing values are shown as "—", never as 0.
 */
export function DailyAnalysis({ patient, riskHistory, deviceHistory }: { patient: PatientDetail; riskHistory: Assessment[] | null; deviceHistory: DeviceHistoryItem[] | null }) {
  const { t, fmt, name } = useI18n();
  const { session } = useSession();
  const tok = session?.token ?? null;
  const { config } = useConfig();
  const bioIds = (config?.biomarkers ?? []).map((b) => b.id).join("|");

  const histories = useApi(async () => {
    const bs = config?.biomarkers ?? [];
    const res = await Promise.allSettled(bs.map((b) => api.biomarkerHistory(tok, patient.id, b.id, 24)));
    const map: Record<string, Reading[]> = {};
    bs.forEach((b, i) => { map[b.id] = res[i].status === "fulfilled" ? res[i].value.data : []; });
    return { data: map, error: null, meta: null };
  }, [tok, patient.id, bioIds, patient.last_update], {});

  const stats = useMemo(() => {
    const map = histories.data ?? {};
    let total = 0, valid = 0, missing = 0;
    let lastAt: number | null = null;
    const perBio: { key: string; label: string; unit: string; count: number; last: number | null; high: number | null; low: number | null }[] = [];
    (config?.biomarkers ?? []).forEach((b) => {
      const rs = map[b.id] ?? [];
      const okRs = rs.filter((r) => r.value != null && r.quality !== "missing");
      total += rs.length; valid += okRs.length; missing += rs.length - okRs.length;
      const vals = okRs.map((r) => r.value as number);
      const last = okRs.length ? okRs.reduce((a, c) => (Date.parse(c.measured_at) > Date.parse(a.measured_at) ? c : a)) : null;
      if (last) lastAt = Math.max(lastAt ?? 0, fmt.toMs(last.measured_at));
      perBio.push({
        key: b.id, label: `${name(b.names)} (${b.abbreviation})`, unit: b.unit, count: rs.length,
        last: last ? last.value : null, high: vals.length ? Math.max(...vals) : null, low: vals.length ? Math.min(...vals) : null,
      });
    });
    return { total, valid, missing, lastAt, perBio, loaded: !!histories.data };
  }, [histories.data, config, name, fmt]);

  /** Number of classification changes + coarse direction inside the 24 h window (from the stored risk history). */
  const riskStats = useMemo(() => {
    const items = (riskHistory ?? [])
      .filter((a) => fmt.toMs(a.computed_at) >= Date.now() - WINDOW_MS)
      .sort((a, b) => fmt.toMs(a.computed_at) - fmt.toMs(b.computed_at));
    if (items.length < 2) return { changes: 0, trend: "none" as const };
    let changes = 0;
    for (let i = 1; i < items.length; i++) if (riskLabel(items[i]) !== riskLabel(items[i - 1])) changes++;
    // Direction = first vs last rankable classification inside the window; if the current state is
    // "insufficient data" there is no meaningful direction to report.
    const labelOf = (i: number) => riskLabel(items[i]);
    if (labelOf(items.length - 1) === "insufficient_data") return { changes, trend: "none" as const };
    const ranked = items.filter((it) => RISK_RANK[riskLabel(it)] !== undefined);
    if (ranked.length < 2) return { changes, trend: "none" as const };
    const first = RISK_RANK[riskLabel(ranked[0])];
    const last = RISK_RANK[riskLabel(ranked[ranked.length - 1])];
    if (first === undefined || last === undefined) return { changes, trend: "none" as const };
    return { changes, trend: last > first ? ("rising" as const) : last < first ? ("falling" as const) : ("stable" as const) };
  }, [riskHistory, fmt]);

  /** Total disconnected time per device inside the window, from the stored status log. */
  const downtimeMs = useMemo(() => {
    const hist = deviceHistory ?? [];
    if (!hist.length) return null;
    const now = Date.now();
    const start = now - WINDOW_MS;
    const byDevice = new Map<number, DeviceHistoryItem[]>();
    hist.forEach((h) => { const arr = byDevice.get(h.device_id) ?? []; arr.push(h); byDevice.set(h.device_id, arr); });
    let total = 0;
    byDevice.forEach((logs) => {
      const sorted = [...logs].sort((a, b) => fmt.toMs(a.ts) - fmt.toMs(b.ts));
      for (let i = 0; i < sorted.length; i++) {
        if (sorted[i].status !== "disconnected") continue;
        const from = Math.max(start, fmt.toMs(sorted[i].ts));
        const to = Math.min(now, i + 1 < sorted.length ? fmt.toMs(sorted[i + 1].ts) : now);
        if (to > from) total += to - from;
      }
    });
    return total;
  }, [deviceHistory, fmt]);

  const availability = stats.total ? stats.valid / stats.total : null;
  const connected = patient.devices.filter((d) => d.status === "connected").length;

  const row = (label: string, value: ReactNode) => (
    <div className="row-between" style={{ borderBottom: "1px solid var(--border)", padding: "6px 0" }}>
      <dt className="small muted">{label}</dt>
      <dd className="num small" style={{ margin: 0, fontWeight: 600 }}>{value}</dd>
    </div>
  );

  return (
    <Card
      title={t("detail.daily.title")}
      actions={<span className="xs muted">{t("detail.daily.subtitle")}</span>}
    >
      <div className="stack">
        {!stats.loaded && <LoadingBlock rows={3} />}
        {stats.loaded && (
          <dl style={{ margin: 0 }}>
            {row(t("detail.daily.readings"), fmt.number(stats.total, 0))}
            {row(t("detail.daily.missing"), stats.total ? fmt.number(stats.missing, 0) : "—")}
            {row(t("detail.daily.availability"), availability === null ? "—" : `${fmt.number(Math.round(availability * 100), 0)}%`)}
            {row(t("detail.daily.lastReading"), stats.lastAt ? fmt.dateTime(new Date(stats.lastAt).toISOString()) : "—")}
            {row(t("detail.daily.riskChanges"), fmt.number(riskStats.changes, 0))}
            {row(t("detail.daily.riskTrend"), t(`detail.daily.trend.${riskStats.trend}`))}
            {row(t("detail.daily.downtime"), downtimeMs === null ? "—" : `${fmt.number(Math.round(downtimeMs / 60000), 0)} min`)}
            {row(t("detail.daily.sensorStatus"), `${fmt.number(connected, 0)} / ${fmt.number(patient.devices.length, 0)}`)}
          </dl>
        )}
        {stats.loaded && stats.total === 0 && <EmptyState>{t("bio.noHistory")}</EmptyState>}
        {stats.loaded && stats.total > 0 && (
          <div className="table-wrap">
            <table>
              <thead><tr>
                <th>{t("detail.daily.bioTable.biomarker")}</th><th>{t("detail.daily.bioTable.last")}</th>
                <th>{t("detail.daily.bioTable.high")}</th><th>{t("detail.daily.bioTable.low")}</th>
                <th>{t("detail.daily.bioTable.count")}</th>
              </tr></thead>
              <tbody>
                {stats.perBio.map((b) => (
                  <tr key={b.key}>
                    <td>{b.label}</td>
                    <td className="num">{b.last === null ? "—" : `${fmt.number(b.last)} ${b.unit}`}</td>
                    <td className="num">{b.high === null ? "—" : `${fmt.number(b.high)} ${b.unit}`}</td>
                    <td className="num">{b.low === null ? "—" : `${fmt.number(b.low)} ${b.unit}`}</td>
                    <td className="num">{fmt.number(b.count, 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="xs muted">{t("detail.daily.computed")}</p>
      </div>
    </Card>
  );
}
