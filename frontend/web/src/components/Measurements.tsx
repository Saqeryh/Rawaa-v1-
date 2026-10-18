import { useState } from "react";
import { api } from "../api/endpoints";
import type { BiomarkerConfig, Device, Reading, Vital, VitalConfig } from "../api/types";
import { useI18n } from "../i18n";
import { useApi } from "../hooks/useApi";
import { useConfig } from "../hooks/useConfig";
import { useSession } from "../auth/session";
import { Badge, Card, ErrorState, LoadingBlock } from "./ui";
import { TrendChart } from "./Charts";

const qualityVariant = { ok: "ok", poor: "warn", missing: "danger" } as const;

export type TrendDir = "rising" | "falling" | "stable" | "none";
export type SensorState = "connected" | "disconnected" | "missing" | "pending";

/**
 * Descriptive direction between the last two valid stored readings of one biomarker.
 * When the backend publishes its demonstration-rule parameter `rising_rel_change` (GET /config),
 * a change smaller than that is reported as "stable"; otherwise only the sign of the change is used.
 * This only describes how the demo records move — it is not a medical threshold or interpretation.
 * Fewer than two valid readings means "none" (insufficient data), never a guess.
 */
export function trendOf(readings: Reading[] | null | undefined, risingRelChange?: number): TrendDir {
  const valid = (readings ?? [])
    .filter((r) => r.value !== null && r.quality !== "missing")
    .sort((a, b) => Date.parse(a.measured_at) - Date.parse(b.measured_at));
  if (valid.length < 2) return "none";
  const last = valid[valid.length - 1].value as number;
  const prev = valid[valid.length - 2].value as number;
  const delta = last - prev;
  if (delta === 0) return "stable";
  if (!risingRelChange || prev === 0) return delta > 0 ? "rising" : "falling";
  const rel = delta / Math.abs(prev);
  return rel >= risingRelChange ? "rising" : rel <= -risingRelChange ? "falling" : "stable";
}

/** Sensor status for one biomarker: connected, disconnected, missing data or pending (no reading yet). */
export function sensorStateOf(cfg: BiomarkerConfig, devices: Device[], reading?: Reading): SensorState {
  const dev = deviceForBiomarker(cfg, devices);
  if (!dev) return "pending";
  if (dev.status !== "connected") return "disconnected";
  if (!reading) return "pending";
  if (reading.value === null || reading.quality === "missing") return "missing";
  return "connected";
}
export const SENSOR_STATE_KEY: Record<SensorState, string> = {
  connected: "status.device.connected", disconnected: "status.device.disconnected",
  missing: "sensorMon.missingData", pending: "bio.pending",
};
const SENSOR_STATE_VARIANT: Record<SensorState, "ok" | "danger" | "warn" | "info"> = {
  connected: "ok", disconnected: "danger", missing: "warn", pending: "info",
};
export function SensorStateBadge({ state }: { state: SensorState }) {
  const { t } = useI18n();
  return <Badge variant={SENSOR_STATE_VARIANT[state]}>{t(SENSOR_STATE_KEY[state])}</Badge>;
}
const TREND_VARIANT: Record<TrendDir, "" | "ok" | "info" | "orange"> = {
  rising: "orange", falling: "info", stable: "ok", none: "",
};
/** "No trend" is a real state (insufficient data) and is never replaced by a fabricated direction. */
export function TrendBadge({ dir }: { dir: TrendDir }) {
  const { t } = useI18n();
  return <Badge variant={TREND_VARIANT[dir]}>{dir === "none" ? t("bio.noTrend") : t(`detail.daily.trend.${dir}`)}</Badge>;
}

/** Latest value + provenance. A missing/absent reading is shown as text, never as 0. */
export function LatestValue({ reading, unit }: { reading?: Reading | Vital; unit: string }) {
  const { t, fmt } = useI18n();
  const missing = !reading || reading.quality === "missing" || reading.value === null;
  return (
    <div className="measure">
      {missing
        ? <div className="val missing">{t("common.noReading")}</div>
        : <div className="val num">{fmt.number(reading!.value)}<small>{unit}</small></div>}
      {reading && <div className="row xs muted">
        <Badge variant={qualityVariant[reading.quality]}>{t(`bio.quality.${reading.quality}`)}</Badge>
        <span>{t("bio.measuredAt")}: <span className="num">{fmt.dateTime(reading.measured_at)}</span></span>
      </div>}
    </div>
  );
}

export function deviceForBiomarker(cfg: BiomarkerConfig, devices: Device[]) {
  return devices.find((d) => d.kind === cfg.sensor_kind);
}

export function BiomarkerCard({ cfg, reading, devices, patientId, range, onDetails }: { cfg: BiomarkerConfig; reading?: Reading; devices: Device[]; patientId: string; range?: number; onDetails?: (cfg: BiomarkerConfig) => void }) {
  const { t, name, fmt } = useI18n();
  const { session } = useSession();
  const { config } = useConfig();
  const token = session?.token ?? null;
  const { data, loading, error, reload } = useApi(() => api.biomarkerHistory(token, patientId, cfg.id, range), [token, patientId, cfg.id, range, reading?.measured_at], {});
  const dev = deviceForBiomarker(cfg, devices);
  const state = sensorStateOf(cfg, devices, reading);
  const trend = trendOf(data, config?.risk_source.params?.rising_rel_change);
  return (
    <Card tight className="stack">
      <div className="row-between">
        <div>
          <h3>{name(cfg.names)} <span className="muted">({cfg.abbreviation})</span></h3>
          <div className="xs muted">{t(`bio.category.${cfg.category}`)}</div>
        </div>
        <SensorStateBadge state={state} />
      </div>
      <LatestValue reading={reading} unit={cfg.unit} />
      <div className="row xs">
        <span className="muted">{t("bio.trend")}</span>
        {data ? <TrendBadge dir={trend} /> : <span className="muted">{t("common.loading")}</span>}
      </div>
      <dl className="xs muted" style={{ margin: 0, display: "grid", gridTemplateColumns: "auto 1fr", gap: "2px 12px" }}>
        <dt>{t("common.sensor")}</dt><dd style={{ margin: 0 }}>{t(`bio.sensorKind.${cfg.sensor_kind}`)}</dd>
        {reading && <><dt>{t("common.source")}</dt><dd style={{ margin: 0 }}>{t(`bio.source.${reading.source}`, {})}</dd></>}
        <dt>{t("sensorMon.mode")}</dt>
        <dd style={{ margin: 0 }}>{dev ? (dev.conceptual ? t("sensorMon.simulationMode") : t("sensorMon.hardwareMode")) : t("common.unknown")}</dd>
        {dev?.last_reading_at && <><dt>{t("device.lastReading")}</dt><dd style={{ margin: 0 }} className="num">{fmt.dateTime(dev.last_reading_at)}</dd></>}
      </dl>
      {onDetails && <div><button type="button" className="btn sm" onClick={() => onDetails(cfg)}>{t("bio.viewDetails")}</button></div>}
      {cfg.id === "hs_crp" && <div className="notice info xs">{t("bio.hsCrpNote")}</div>}
      {loading && <LoadingBlock rows={2} />}
      {error && !data && <ErrorState error={error} onRetry={reload} />}
      {data && <TrendChart points={data} unit={cfg.unit} color={cfg.color} label={`${name(cfg.names)} (${cfg.abbreviation})`} />}
    </Card>
  );
}

export function VitalCard({ cfg, reading, patientId }: { cfg: VitalConfig; reading?: Vital; patientId: string }) {
  const { t, name } = useI18n();
  const { session } = useSession();
  const token = session?.token ?? null;
  const { data, loading, error, reload } = useApi(() => api.vitals(token, patientId, cfg.id), [token, patientId, cfg.id, reading?.measured_at]);
  return (
    <Card tight className="stack">
      <div className="row-between"><h3>{name(cfg.names)}</h3><span className="xs muted">{cfg.sensor}</span></div>
      <LatestValue reading={reading} unit={cfg.unit} />
      {loading && <LoadingBlock rows={2} />}
      {error && !data && <ErrorState error={error} onRetry={reload} />}
      {data && <TrendChart points={data} unit={cfg.unit} color="#8a74f9" label={name(cfg.names)} />}
    </Card>
  );
}

export function RangeSelect({ value, onChange }: { value: number | undefined; onChange: (v: number | undefined) => void }) {
  const { t } = useI18n();
  const opts: [number | undefined, string][] = [[6, t("bio.range6")], [12, t("bio.range12")], [24, t("bio.range24")], [undefined, t("bio.rangeAll")]];
  return (
    <div className="segmented" role="group" aria-label={t("bio.range")}>
      {opts.map(([v, label]) => <button key={label} type="button" aria-pressed={value === v} onClick={() => onChange(v)}>{label}</button>)}
    </div>
  );
}

export function DeviceList({ devices }: { devices: Device[] }) {
  const { t, fmt } = useI18n();
  const [open] = useState(true);
  return open ? (
    <ul className="timeline" style={{ gap: 12 }}>
      {devices.map((d) => (
        <li key={d.id}>
          <div>
            <div className="row"><strong>{t(`device.kind.${d.kind}`)}</strong><Badge variant={d.status === "connected" ? "ok" : "danger"}>{t(`status.device.${d.status}`)}</Badge></div>
            <div className="xs muted">{d.conceptual && t("device.conceptual")}</div>
            <div className="xs muted">{t("device.lastReading")}: <span className="num">{d.last_reading_at ? fmt.dateTime(d.last_reading_at) : t("common.never")}</span></div>
          </div>
        </li>
      ))}
    </ul>
  ) : null;
}
