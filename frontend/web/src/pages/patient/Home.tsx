import { useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api/endpoints";
import type { Reading } from "../../api/types";
import { useSession } from "../../auth/session";
import { useI18n } from "../../i18n";
import { useApi } from "../../hooks/useApi";
import { useAction } from "../../hooks/useAction";
import { useConfig } from "../../hooks/useConfig";
import { AlertList } from "../../components/AlertList";
import { TrendChart } from "../../components/Charts";
import { LatestValue, SENSOR_STATE_KEY, TrendBadge, sensorStateOf, trendOf } from "../../components/Measurements";
import { EmergencyPanel, ProposalCard } from "../../components/ProposalCard";
import { ConnectionIndicator, RiskBadge } from "../../components/shared";
import { Badge, Card, EmptyState, ErrorState, LoadingBlock } from "../../components/ui";
import { usePatient } from "./context";

const validOf = (rs: Reading[]) => rs.filter((r) => r.value !== null && r.quality !== "missing");

/** Patient Home — a calm, patient-centric health monitoring dashboard. */
export default function Home() {
  const { t, fmt, name } = useI18n();
  const { session } = useSession();
  const tok = session?.token ?? null;
  const { patient: p, alerts, connection, lastSuccess, refresh } = usePatient();
  const { config } = useConfig();
  const proposals = useApi(() => api.proposals(tok, p.id), [tok, p.id, p.risk?.id], { pollMs: 5000 });
  const resolve = useAction();
  const [selBio, setSelBio] = useState<string | null>(null);

  const bios = config?.biomarkers ?? [];
  const bioIds = bios.map((b) => b.id).join("|");
  const relChange = config?.risk_source.params?.rising_rel_change;

  // Last 24 h of every biomarker in ONE batch: feeds the card trends, the daily chart and the summary.
  const hist = useApi(async () => {
    const res = await Promise.allSettled(bios.map((b) => api.biomarkerHistory(tok, p.id, b.id, 24)));
    const map: Record<string, Reading[]> = {};
    bios.forEach((b, i) => { map[b.id] = res[i].status === "fulfilled" ? res[i].value.data : []; });
    return { data: map, error: null, meta: null };
  }, [tok, p.id, bioIds, p.last_update], {});

  // Connection status log — used for "last sync" evidence and the health timeline.
  const devHist = useApi(() => api.deviceHistory(tok, p.id), [tok, p.id, p.devices.map((d) => d.status).join()], { enabled: p.devices.length > 0 });

  // ---- derived, from API records only ----
  const summary = useMemo(() => {
    const map = hist.data ?? {};
    let total = 0, valid = 0, lastMs: number | null = null;
    const dirs: ReturnType<typeof trendOf>[] = [];
    bios.forEach((b) => {
      const rs = map[b.id] ?? [];
      const v = validOf(rs);
      total += rs.length; valid += v.length;
      v.forEach((r) => { const ms = fmt.toMs(r.measured_at); if (lastMs === null || ms > lastMs) lastMs = ms; });
      dirs.push(trendOf(rs, relChange));
    });
    // Overall direction = the strongest direction any marker shows (descriptive, not a medical rule).
    const overall = dirs.includes("rising") ? "rising" : dirs.includes("falling") ? "falling" : dirs.includes("stable") ? "stable" : "none";
    return { total, valid, missing: total - valid, lastMs, overall, loaded: !!hist.data };
  }, [hist.data, bios, relChange, fmt]);

  const allConnected = p.devices.length > 0 && p.devices.every((d) => d.status === "connected");
  const anyMissing = bios.some((b) => { const r = p.latest_biomarkers?.[b.id]; return !r || r.value === null || r.quality === "missing"; });
  const lastDeviceReading = p.devices.reduce<string | null>((acc, d) => (d.last_reading_at && (!acc || fmt.toMs(d.last_reading_at) > fmt.toMs(acc)) ? d.last_reading_at : acc), null);
  const hsCrp = bios.find((b) => b.id === "hs_crp");

  const timeline: Array<{ ts: string; text: string }> = useMemo(() => {
    const items: Array<{ ts: string; text: string }> = [];
    if (p.monitoring_start) items.push({ ts: p.monitoring_start, text: t("patientApp.tl.monitoringStarted") });
    (devHist.data ?? []).forEach((h) => {
      const eventKind = h.status === "connected" ? "device_connected" : "device_disconnected";
      items.push({ ts: h.ts, text: t("sim.eventKind." + eventKind) + " — " + t("device.kind." + h.kind) });
    });
    alerts.forEach((a) => items.push({ ts: a.created_at, text: t("alert.title") + " — " + t(a.message_key) }));
    if (summary.lastMs) items.push({ ts: new Date(summary.lastMs).toISOString(), text: t("patientApp.tl.readingReceived") });
    return items.sort((a, b) => fmt.toMs(b.ts) - fmt.toMs(a.ts)).slice(0, 6);
  }, [devHist.data, alerts, summary.lastMs, t, fmt, p.monitoring_start]);

  const patientDisplayName = p.display_name || "Layla Hassan";
  const lastUpdateMeta = p.last_update ? fmt.dateTime(p.last_update) : t("common.never");
  const patientId = p.id || "P-1001";

  const selCfg = bios.find((b) => b.id === selBio) ?? bios[0];
  const selRows = selCfg ? (hist.data?.[selCfg.id] ?? []) : [];
  const selValid = validOf(selRows);
  const selLatest = selValid.length ? selValid[selValid.length - 1] : null;
  const selTrend = trendOf(selRows, relChange);
  const selMissing = selRows.length - selValid.length;

  const row = (label: string, value: ReactNode) => (
    <div className="row-between" style={{ borderBottom: "1px solid var(--border)", padding: "6px 0" }}>
      <dt className="small muted">{label}</dt>
      <dd className="num small" style={{ margin: 0, fontWeight: 600 }}>{value}</dd>
    </div>
  );

  return (
    <>
      {/* The purple vertical header is rendered by PatientHeader —
          the Home screen must not render its own duplicate header. */}

      {/* ── Critical monitoring alert (demo classification, never a diagnosis) ── */}
      {p.risk?.status === "ok" && p.risk.category_key === "critical_thrombosis_risk" && (
        <div className="notice danger" role="alert">
          <strong>{t("patientApp.criticalTitle")}</strong>
          <div>{t("patientApp.criticalText")}</div>
          <div className="xs">{t("patientApp.criticalAction")}</div>
        </div>
      )}

      {/* ── Patch & sensor status (device records + connection log) ── */}
      <Card title={t("patientApp.deviceStatus")}>
        <div className="stack-sm">
          {p.devices.length === 0 ? <EmptyState>{t("bio.noData")}</EmptyState> : p.devices.map((d) => (
            <div key={d.id} className="row-between" style={{ alignItems: "flex-start" }}>
              <span className="small">
                <strong>{t("device.kind." + d.kind)}</strong>
                <span className="xs muted" style={{ display: "block" }}>{d.name}</span>
              </span>
              <Badge variant={d.status === "connected" ? "ok" : "danger"}>{t("status.device." + d.status)}</Badge>
            </div>
          ))}
          {p.devices.length > 0 && <p className="small">{allConnected ? t("patientApp.receivingData") : t("patientApp.checkDevice")}</p>}
          {anyMissing && <div className="notice xs">{t("alert.missing_data")}</div>}
          {p.devices.some((d) => d.status !== "connected") && <div className="notice danger xs" role="alert">{t("alert.device_disconnected")}</div>}
          <dl style={{ margin: 0 }}>
            {row(t("device.lastSync"), p.last_update ? `${fmt.dateTime(p.last_update)} (${fmt.relative(p.last_update)})` : t("common.never"))}
            {row(t("device.lastReading"), lastDeviceReading ? fmt.dateTime(lastDeviceReading) : t("common.never"))}
            {row(t("common.source"), p.devices.some((d) => d.conceptual) ? t("sensorMon.sourceSimulated") : t("sensorMon.sourceHardware"))}
            {row(t("sensorMon.mode"), p.devices.some((d) => d.conceptual) ? t("sensorMon.simulationMode") : t("sensorMon.hardwareMode"))}
          </dl>
          {hsCrp && <p className="xs muted">{t("patientApp.hsCrpSensorNote", { name: name(hsCrp.names), abbr: hsCrp.abbreviation, sensor: t("bio.sensorKind." + hsCrp.sensor_kind) })}</p>}
          <p className="xs muted">{t("device.conceptual")}</p>
        </div>
      </Card>

      {/* ── Monitoring status + risk monitoring ── */}
      <div className="grid">
        <Card title={t("patientApp.monitoringStatus")}>
          <div className="stack-sm">
            <div><Badge variant={p.monitoring_status === "active" ? "ok" : ""}>{t("status.monitoring." + p.monitoring_status)}</Badge></div>
            <dl style={{ margin: 0 }}>
              {row(t("detail.daily.readings"), summary.loaded && summary.total > 0 ? fmt.number(summary.total, 0) : "—")}
              {row(t("detail.daily.lastReading"), summary.lastMs ? fmt.dateTime(new Date(summary.lastMs).toISOString()) : "—")}
              {row(t("common.lastUpdate"), p.last_update ? `${fmt.dateTime(p.last_update)} (${fmt.relative(p.last_update)})` : t("common.never"))}
              {row(t("common.source"), p.devices.some((d) => d.conceptual) ? t("sensorMon.sourceSimulated") : t("sensorMon.sourceHardware"))}
            </dl>
            <ConnectionIndicator state={connection} lastUpdate={lastSuccess} />
            <p className="xs muted">{t("notice.simulated")}</p>
            <p className="xs muted">{t("notice.demo")}</p>
          </div>
        </Card>

        <Card title={t("patientApp.riskMonitoring")}>
          <div className="stack-sm">
            <div className="row">
              <RiskBadge risk={p.risk} />
              <span className="xs muted">{t("risk.computedAt")}: <span className="num">{p.risk ? fmt.dateTime(p.risk.computed_at) : "—"}</span></span>
            </div>
            <p className="small">
              {p.risk
                ? t(p.risk.details.explanation_key) + (p.risk.status !== "ok" && p.risk.details.reason ? " " + t("risk.reason." + p.risk.details.reason) : "")
                : t("risk.unavailable")
              }
            </p>
            {p.risk && (
              <div className="row xs">
                <Badge variant="info">{t("risk.source." + p.risk.source)}</Badge>
                <span className="muted num">{p.risk.model_version}</span>
              </div>
            )}
            <div className="notice xs">{t("notice.riskDemo")}</div>
          </div>
        </Card>
      </div>

      {/* ── Biomarkers overview (the four RAWA markers) ── */}
      {bios.length > 0 && (
        <section className="stack" aria-labelledby="home-bio-h">
          <div className="row-between">
            <h2 id="home-bio-h">{t("nav.biomarkers")}</h2>
            <Link className="btn sm" to="/patient/biomarkers">{t("patientApp.seeAll")}</Link>
          </div>
          <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 150px), 1fr))" }}>
            {bios.map((b) => {
              const reading = p.latest_biomarkers?.[b.id];
              const state = sensorStateOf(b, p.devices, reading);
              return (
                <div key={b.id} className="stack-sm">
                  <div className="row-between" style={{ alignItems: "flex-start" }}>
                    <div>
                      <strong>{b.abbreviation}</strong>
                      <div className="xs muted">{name(b.names)}</div>
                    </div>
                    <TrendBadge dir={trendOf(hist.data?.[b.id], relChange)} />
                  </div>
                  <LatestValue reading={reading} unit={b.unit} />
                  <div className="xs muted">{t("bio.sensorStatus")}: {t(SENSOR_STATE_KEY[state])}</div>
                  <div className="xs muted">
                    {reading ? t(`bio.source.${reading.source}`) : t("bio.noData")} · {b.id === "hs_crp" ? t(`bio.sensorKind.${b.sensor_kind}`) : (p.devices.some((d) => d.conceptual) ? t("sensorMon.simulationMode") : t("sensorMon.hardwareMode"))}
                  </div>
                </div>
              );
            })}
          </div>
          {hist.error && !hist.data && <ErrorState error={hist.error} onRetry={hist.reload} />}
        </section>
      )}

      {/* ── Daily biomarker chart (last 24 h) ── */}
      {selCfg && (
        <Card title={t("patientApp.chartTitle")}>
          <div className="stack-sm">
            <div className="chips" role="group" aria-label={t("nav.biomarkers")}>
              {bios.map((b) => {
                const on = b.id === selCfg.id;
                return (
                  <button
                    key={b.id} type="button" className="chip" aria-pressed={on} title={b.abbreviation}
                    style={on ? { minHeight: 44, background: "var(--primary-strong)", color: "#fff" } : { minHeight: 44 }}
                    onClick={() => setSelBio(b.id)}
                  >{name(b.names)}</button>
                );
              })}
            </div>
            <div className="row xs muted" style={{ gap: 12 }}>
              <span>{t("bio.latest")}: <b className="num">{selLatest ? `${fmt.number(selLatest.value)} ${selCfg.unit}` : t("bio.noData")}</b></span>
              <span>{t("bio.measuredAt")}: <b className="num">{selLatest ? fmt.dateTime(selLatest.measured_at) : "—"}</b></span>
              <span>{t("bio.trend")}: <TrendBadge dir={selTrend} /></span>
              <span>{t("detail.daily.missing")}: <b className="num">{hist.data ? fmt.number(selMissing, 0) : "—"}</b></span>
            </div>
            {!hist.data && hist.loading && <LoadingBlock rows={3} />}
            {hist.error && !hist.data && <ErrorState error={hist.error} onRetry={hist.reload} />}
            {hist.data && <TrendChart points={selRows} unit={selCfg.unit} color={selCfg.color} label={`${name(selCfg.names)} (${selCfg.abbreviation})`} />}
          </div>
        </Card>
      )}

      {/* ── Today's summary (computed from the last-24-h records) ── */}
      <Card title={t("patientApp.dailySummary")} actions={<span className="xs muted">{t("detail.daily.subtitle")}</span>}>
        {!hist.data && hist.loading && <LoadingBlock rows={3} />}
        {hist.data && summary.total === 0 && <EmptyState>{t("bio.noData")}</EmptyState>}
        {hist.data && summary.total > 0 && (
          <dl style={{ margin: 0 }}>
            {row(t("detail.daily.readings"), fmt.number(summary.total, 0))}
            {row(t("detail.daily.availability"), `${fmt.number(Math.round((summary.valid / summary.total) * 100), 0)}%`)}
            {row(t("detail.daily.missing"), fmt.number(summary.missing, 0))}
            {row(t("detail.daily.lastReading"), summary.lastMs ? fmt.dateTime(new Date(summary.lastMs).toISOString()) : "—")}
            {row(t("detail.daily.sensorStatus"), t("detail.daily.sensorStatus") + ", " + fmt.number(p.devices.filter((d) => d.status === "connected").length, 0) + " / " + fmt.number(p.devices.length, 0))}
            {row(t("bio.trend"), summary.overall === "none" ? t("bio.noTrend") : t("detail.daily.trend." + summary.overall))}
          </dl>
        )}
        <p className="xs muted" style={{ marginTop: 8 }}>{t("detail.daily.computed")}</p>
      </Card>

      {/* ── Vitals (latest stored values from the wearable sensors) ── */}
      {(config?.vitals ?? []).length > 0 && (
        <Card title={t("nav.vitals")}>
          <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 140px), 1fr))" }}>
            {(config?.vitals ?? []).map((v) => (
              <div key={v.id} className="stack-sm">
                <div className="small"><strong>{name(v.names)}</strong><div className="xs muted">{v.sensor}</div></div>
                <LatestValue reading={p.latest_vitals?.[v.id]} unit={v.unit} />
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* ── Alerts ── */}
      <Card title={t("patientApp.notifications")}>
        {alerts.length === 0 ? <p className="muted">{t("patientApp.noNotifications")}</p> : <AlertList alerts={alerts} />}
      </Card>

      {/* ── Health timeline (derived from this patient's connection log, alerts and readings) ── */}
      <Card title={t("patientApp.timelineTitle")}>
        {timeline.length === 0 ? <EmptyState>{t("common.empty")}</EmptyState> : (
          <ul className="timeline">
            {timeline.map((e, i) => (
              <li key={`${e.ts}-${i}`}><div>{e.text}</div><div className="xs muted num">{fmt.dateTime(e.ts)}</div></li>
            ))}
          </ul>
        )}
      </Card>

      {/* ── Quick actions (TAPs and Settings also live in the bottom dock) ── */}
      <section className="stack-sm" aria-labelledby="home-qa-h">
        <h2 id="home-qa-h">{t("patientApp.quickActions")}</h2>
        <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 140px), 1fr))" }}>
          <Link className="btn grow" to="/patient/biomarkers">{t("patientApp.openBiomarkers")}</Link>
          <Link className="btn grow" to="/patient/vitals">{t("patientApp.openVitals")}</Link>
          <Link className="btn grow" to="/patient/assistant">{t("nav.taps")}</Link>
          <Link className="btn grow" to="/patient/settings">{t("nav.settings")}</Link>
        </div>
      </section>

      {(proposals.data ?? []).some((x) => x.status === "pending") && <div className="notice info xs">{t("patientApp.proposalHint")}</div>}
      <ProposalCard proposals={proposals.data ?? []} onResolve={async (pr, action) => { await resolve.run(() => action === "confirm" ? api.confirmProposal(tok, pr.id) : api.cancelProposal(tok, pr.id)); proposals.refresh(); refresh(); }} />
      {resolve.error ? <ErrorState error={resolve.error} /> : null}
      <EmergencyPanel />
      <p className="xs muted" style={{ textAlign: "center" }}>{t("patientApp.ownDataOnly")} · {t("notice.demo")}</p>
    </>
  );
}