import { useMemo, useState } from "react";
import { api } from "../api/endpoints";
import type { BiomarkerConfig, Device, DeviceHistoryItem, Reading } from "../api/types";
import { useSession } from "../auth/session";
import { useI18n } from "../i18n";
import { useApi } from "../hooks/useApi";
import { useConfig } from "../hooks/useConfig";
import { TrendChart } from "./Charts";
import { LatestValue, SENSOR_STATE_KEY, SensorStateBadge, sensorStateOf, trendOf, TrendBadge } from "./Measurements";
import { Badge, Dialog, EmptyState, ErrorState, LoadingBlock } from "./ui";

const WINDOW_MS = 24 * 3600_000;
const validReadings = (rs: Reading[]) => rs.filter((r) => r.value !== null && r.quality !== "missing");

/**
 * Biomarker Trends + Reading History for ONE patient, for the doctor's Patient Details view.
 * Every number here comes from GET /patients/{id}/biomarkers/{bid}/history (since_hours=24) —
 * nothing is generated in the frontend, and empty data shows an explicit empty state, never a fake chart.
 */
export function BiomarkerTrends({ patientId, biomarkers, devices, onDetails }: {
  patientId: string; biomarkers: BiomarkerConfig[]; devices: Device[];
  onDetails: (cfg: BiomarkerConfig) => void;
}) {
  const { t, fmt, name } = useI18n();
  const { session } = useSession();
  const tok = session?.token ?? null;
  const { config } = useConfig();
  const [sel, setSel] = useState<string | null>(null);
  const cfg = biomarkers.find((b) => b.id === sel) ?? biomarkers[0];

  const hist = useApi(() => api.biomarkerHistory(tok, patientId, cfg.id, 24), [tok, patientId, cfg?.id], { enabled: !!cfg });

  const stats = useMemo(() => {
    const rows = hist.data ?? [];
    const valid = validReadings(rows);
    return {
      rows, valid, missing: rows.length - valid.length,
      latest: valid.length ? valid[valid.length - 1] : null,
      trend: trendOf(rows, config?.risk_source.params?.rising_rel_change),
      loaded: !!hist.data,
    };
  }, [hist.data, config]);

  if (!cfg) return <EmptyState>{t("bio.noData")}</EmptyState>;
  const label = `${name(cfg.names)} (${cfg.abbreviation})`;

  return (
    <section className="stack" aria-labelledby="bio-trends-h">
      <div className="row-between">
        <h2 id="bio-trends-h">{t("bio.trendsTitle")}</h2>
        <span className="xs muted">{t("detail.daily.subtitle")}</span>
      </div>
      <div className="segmented" role="group" aria-label={t("bio.trendsTitle")} style={{ flexWrap: "wrap" }}>
        {biomarkers.map((b) => (
          <button
            key={b.id} type="button" aria-pressed={b.id === cfg.id} title={name(b.names)}
            onClick={() => setSel(b.id)}
          >{name(b.names)} ({b.abbreviation})</button>
        ))}
      </div>

      {/* Time · Value · Trend · Missing — an accessible summary that also covers the empty case. */}
      <dl className="xs" style={{ margin: 0, display: "grid", gridTemplateColumns: "auto 1fr", gap: "4px 12px" }}>
        <dt className="muted">{t("common.timestamp")}</dt>
        <dd className="num" style={{ margin: 0 }}>{stats.latest ? fmt.dateTime(stats.latest.measured_at) : t("common.never")}</dd>
        <dt className="muted">{t("common.value")}</dt>
        <dd className="num" style={{ margin: 0 }}>{stats.latest ? `${fmt.number(stats.latest.value)} ${cfg.unit}` : t("bio.noData")}</dd>
        <dt className="muted">{t("bio.trend")}</dt>
        <dd style={{ margin: 0 }}><TrendBadge dir={stats.trend} /></dd>
        <dt className="muted">{t("charts.missingPoint")}</dt>
        <dd className="num" style={{ margin: 0 }}>{stats.loaded ? fmt.number(stats.missing, 0) : t("common.loading")}</dd>
      </dl>

      {hist.loading && !hist.data && <LoadingBlock rows={3} />}
      {hist.error && !hist.data && <ErrorState error={hist.error} onRetry={hist.reload} />}
      {hist.data && <TrendChart points={hist.data} unit={cfg.unit} color={cfg.color} label={label} />}

      <div className="row-between"><h3 style={{ margin: 0 }}>{t("bio.readingHistory")}</h3>
        <button type="button" className="btn sm" onClick={() => onDetails(cfg)}>{t("bio.viewDetails")}</button>
      </div>
      {hist.data && hist.data.length === 0 && <EmptyState>{t("bio.noData")}</EmptyState>}
      {hist.data && hist.data.length > 0 && (
        <div className="table-wrap">
          <table>
            <caption className="sr-only">{`${t("bio.readingHistory")} — ${label}`}</caption>
            <thead>
              <tr><th>{t("common.timestamp")}</th><th>{t("common.value")}</th><th>{t("common.status")}</th><th>{t("common.source")}</th></tr>
            </thead>
            <tbody>
              {[...hist.data].reverse().slice(0, 20).map((r, i) => (
                <tr key={`${r.measured_at}-${i}`}>
                  <td className="xs num">{fmt.dateTime(r.measured_at)}</td>
                  <td className="num">{r.value === null || r.quality === "missing" ? t("common.noReading") : `${fmt.number(r.value)} ${cfg.unit}`}</td>
                  <td><Badge variant={qualityVariant(r.quality)}>{t(`bio.quality.${r.quality}`)}</Badge></td>
                  <td className="xs">{t(`bio.source.${r.source}`)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="xs muted">{t("bio.gapsNote")}</p>
    </section>
  );
}

const QUALITY_VARIANT: Record<Reading["quality"], "ok" | "warn" | "danger"> = { ok: "ok", poor: "warn", missing: "danger" };
const qualityVariant = (q: Reading["quality"]) => QUALITY_VARIANT[q];

/**
 * "View details" for a single biomarker: current reading, previous readings, 24-hour trend and a
 * descriptive daily analysis built only from the stored records of THIS patient. No interpretation,
 * no diagnosis, no invented values — an absent reading stays "No reading".
 */
export function BiomarkerDetailDialog({ patientId, cfg, devices, latest, deviceHistory, onClose }: {
  patientId: string; cfg: BiomarkerConfig; devices: Device[];
  latest?: Reading; deviceHistory: DeviceHistoryItem[] | null; onClose: () => void;
}) {
  const { t, fmt, name } = useI18n();
  const { session } = useSession();
  const tok = session?.token ?? null;
  const { config } = useConfig();
  const label = `${name(cfg.names)} (${cfg.abbreviation})`;

  // One request for the last 24 h window (daily analysis + trend) and one for the full stored history
  // (previous readings). Both hit the same existing per-patient endpoint.
  const hist = useApi(async () => {
    const [day, all] = await Promise.allSettled([
      api.biomarkerHistory(tok, patientId, cfg.id, 24),
      api.biomarkerHistory(tok, patientId, cfg.id),
    ]);
    if (day.status === "rejected" && all.status === "rejected") throw day.reason;
    return {
      data: {
        day: day.status === "fulfilled" ? day.value.data : [],
        all: all.status === "fulfilled" ? all.value.data : [],
      },
      error: null, meta: null,
    };
  }, [tok, patientId, cfg.id], {});

  const day = hist.data?.day ?? [];
  const all = hist.data?.all ?? [];
  const valid = validReadings(day);
  const values = valid.map((r) => r.value as number);
  const trend = trendOf(day, config?.risk_source.params?.rising_rel_change);
  const dev = devices.find((d) => d.kind === cfg.sensor_kind);
  const state = sensorStateOf(cfg, devices, latest);
  const lastSync = (deviceHistory ?? [])
    .filter((h) => h.kind === cfg.sensor_kind)
    .reduce<string | null>((acc, h) => (!acc || Date.parse(h.ts) > Date.parse(acc) ? h.ts : acc), null);
  const lastValid = valid.length ? valid[valid.length - 1] : null;
  const previous = all.filter((r) => !(latest && r.measured_at === latest.measured_at)).slice(-15).reverse();

  const row = (label2: string, value: string) => (
    <div className="row-between" style={{ borderBottom: "1px solid var(--border)", padding: "6px 0" }}>
      <dt className="small muted">{label2}</dt>
      <dd className="num small" style={{ margin: 0, fontWeight: 600 }}>{value}</dd>
    </div>
  );

  return (
    <Dialog title={label} onClose={onClose}
      actions={<button type="button" className="btn" onClick={onClose}>{t("common.close")}</button>}>
      <div className="stack">
        <div className="row" style={{ flexWrap: "wrap" }}>
          <SensorStateBadge state={state} />
          <Badge variant="info">{dev?.conceptual ? t("sensorMon.simulationMode") : t("sensorMon.hardwareMode")}</Badge>
          <span className="xs muted">{t("common.source")}: {latest ? t(`bio.source.${latest.source}`) : t("bio.noData")}</span>
        </div>
        <p className="xs muted" style={{ margin: 0 }}>{t("bio.unitConfigurable")}</p>

        <h3 style={{ margin: 0 }}>{t("bio.currentReading")}</h3>
        <LatestValue reading={latest} unit={cfg.unit} />

        <div className="row-between"><h3 style={{ margin: 0 }}>{t("bio.last24")}</h3><span className="xs muted">{t("detail.daily.subtitle")}</span></div>
        {!hist.data && hist.loading && <LoadingBlock rows={2} />}
        {hist.error && !hist.data && <ErrorState error={hist.error} onRetry={hist.reload} />}
        {hist.data && <TrendChart points={day} unit={cfg.unit} color={cfg.color} label={`${label} — ${t("detail.daily.subtitle")}`} />}

        <h3 style={{ margin: 0 }}>{t("detail.daily.title")}</h3>
        {!hist.data && hist.loading && <LoadingBlock rows={3} />}
        {hist.data && (
          <dl style={{ margin: 0 }}>
            {row(t("detail.daily.readings"), fmt.number(day.length, 0))}
            {row(t("detail.daily.missing"), day.length ? fmt.number(day.length - valid.length, 0) : "—")}
            {row(t("detail.daily.lastReading"), lastValid ? fmt.dateTime(lastValid.measured_at) : "—")}
            {row(t("detail.daily.bioTable.high"), values.length ? `${fmt.number(Math.max(...values))} ${cfg.unit}` : "—")}
            {row(t("detail.daily.bioTable.low"), values.length ? `${fmt.number(Math.min(...values))} ${cfg.unit}` : "—")}
            {row(t("bio.trend"), trend === "none" ? t("bio.noTrend") : t(`detail.daily.trend.${trend}`))}
            {row(t("bio.sensorStatus"), t(SENSOR_STATE_KEY[state]))}
            {row(t("sensorMon.lastConnection"), lastSync ? fmt.dateTime(lastSync) : "—")}
          </dl>
        )}
        {hist.data && day.length === 0 && <EmptyState>{t("bio.noData")}</EmptyState>}
        <p className="xs muted" style={{ margin: 0 }}>{t("detail.daily.computed")}</p>

        <h3 style={{ margin: 0 }}>{t("bio.previousReadings")}</h3>
        {!hist.data && hist.loading && <LoadingBlock rows={2} />}
        {hist.data && previous.length === 0 && <EmptyState>{t("bio.noData")}</EmptyState>}
        {hist.data && previous.length > 0 && (
          <div className="table-wrap">
            <table>
              <caption className="sr-only">{`${t("bio.previousReadings")} — ${label}`}</caption>
              <thead>
                <tr><th>{t("common.timestamp")}</th><th>{t("common.value")}</th><th>{t("common.status")}</th><th>{t("common.source")}</th></tr>
              </thead>
              <tbody>
                {previous.map((r, i) => (
                  <tr key={`${r.measured_at}-${i}`}>
                    <td className="xs num">{fmt.dateTime(r.measured_at)}</td>
                    <td className="num">{r.value === null || r.quality === "missing" ? t("common.noReading") : `${fmt.number(r.value)} ${cfg.unit}`}</td>
                    <td><Badge variant={qualityVariant(r.quality)}>{t(`bio.quality.${r.quality}`)}</Badge></td>
                    <td className="xs">{t(`bio.source.${r.source}`)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="xs muted" style={{ margin: 0 }}>{t("bio.gapsNote")}</p>
        <div className="notice xs">{t("notice.demo")} · {t("notice.simulated")}</div>
      </div>
    </Dialog>
  );
}

