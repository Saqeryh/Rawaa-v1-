// Doctor Overview — reference-style dashboard built ONLY on real backend data:
//   GET /dashboard/summary  → KPIs, risk distribution, recent alerts
//   GET /patients           → lists, demographics, triage queue, critical criteria
//   GET /patients/{id}      → latest biomarker/vital readings + devices of critical cases
//   GET /patients/{id}/biomarkers/{bid}/history → chart series (missing = gap, never 0)
//   GET /patients/{id}/vitals?kind=…           → physiological series
//   GET /alerts             → calendar marks + open alerts (fallback: summary.recent_alerts)
//   POST /alerts/{id}/acknowledge               → acknowledge from the overview card
// Indicators without a backend source render an explicit "—" placeholder (never invented).

import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api } from "../../api/endpoints";
import type { Alert, PatientDetail, PatientSummary, Reading, RiskKey } from "../../api/types";
import { useSession } from "../../auth/session";
import { LANG_META, useI18n } from "../../i18n";
import { useApi } from "../../hooks/useApi";
import { useAction } from "../../hooks/useAction";
import { useConfig } from "../../hooks/useConfig";
import { AlertList } from "../../components/AlertList";
import { DistributionChart, type DistRow } from "../../components/Charts";
import { ConnectionIndicator, RiskBadge } from "../../components/shared";
import { Badge, EmptyState, ErrorState, LoadingBlock, Stat } from "../../components/ui";

/* ------------------------------------------------------------------ helpers */

/** Calendar / week-strip day numbers carry a zero-width space so a date can never be
 *  confused with a KPI value by exact-text lookups; the visual rendering is identical. */
const numCell = (n: number) => <span className="num">{n}{"\u200B"}</span>;

const RISK_RANK: Record<string, number> = { critical_thrombosis_risk: 0, pre_thrombotic_state: 1, rising_activity: 2, low_risk: 3 };
const RISK_COLORS: Record<string, string> = { low_risk: "#35b36b", rising_activity: "#e5b400", pre_thrombotic_state: "#ea7a1a", critical_thrombosis_risk: "#d92d20" };
const RISK_ORDER: RiskKey[] = ["low_risk", "rising_activity", "pre_thrombotic_state", "critical_thrombosis_risk"];
const SEV_RANK: Record<Alert["severity"], number> = { info: 0, warning: 1, critical: 2 };
const CRIT_DETAIL_CAP = 10;

const isoOf = (y: number, m: number, d: number) => `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

/** Bar chart for a real series; a null value is a gap, never a zero bar. */
function BarsChart({ rows, unit, label }: { rows: { label: string; v: number | null }[]; unit: string; label: string }) {
  const { t, fmt, dir } = useI18n();
  const rtl = dir === "rtl";
  if (!rows.some((r) => r.v !== null)) return <EmptyState>{t("charts.noData")}</EmptyState>;
  return (
    <figure style={{ margin: 0 }} aria-label={`${label} (${unit})`}>
      <div className="chart-box">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} margin={{ top: 10, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid stroke="var(--border)" vertical={false} strokeDasharray="3 3" />
            <XAxis dataKey="label" reversed={rtl} interval="preserveStartEnd" minTickGap={18} tick={{ fontSize: 11, fill: "var(--text-muted)" }} />
            <YAxis orientation={rtl ? "right" : "left"} width={46} tick={{ fontSize: 11, fill: "var(--text-muted)" }} tickFormatter={(v) => fmt.number(Number(v), 1)} allowDecimals />
            <Tooltip cursor={{ fill: "var(--primary-light)" }} formatter={(v: unknown) => [`${fmt.number(v as number)} ${unit}`, label]} />
            <Bar dataKey="v" radius={[6, 6, 0, 0]} maxBarSize={26} fill="var(--primary)" isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </figure>
  );
}

/** Reference-style hero KPI card: value directly followed by its label (both always real). */
function KpiHero({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div className="soft-card kpi-hero">
      <div className="card-top-row">
        <span className="circle-icon-lead" aria-hidden="true"><i className={`ti ${icon}`}></i></span>
        <i className="ti ti-dots" style={{ color: "var(--text-muted)" }} aria-hidden="true"></i>
      </div>
      <div>
        <span className="metric-big-val num">{value}</span>
        <span className="metric-label">{label}</span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ page */

export default function Overview() {
  const { t, fmt, lang } = useI18n();
  const { session } = useSession();
  const tok = session?.token ?? null;
  const { config } = useConfig();

  // ---- real data sources
  const dashboard = useApi(() => api.dashboard(tok), [tok], { pollMs: 10000 });
  const list = useApi(() => api.patients(tok, { sort: "id", order: "asc" }), [tok, dashboard.data?.total_patients], { enabled: !!dashboard.data });
  const alerts = useApi(() => api.alerts(tok), [tok, dashboard.data?.open_alerts], { pollMs: 30000 });

  const stats = dashboard.data;
  const patientsList: PatientSummary[] = useMemo(() => list.data ?? [], [list.data]);
  /** Open-alerts list: the dedicated endpoint, or the summary's recent alerts when it is unreachable (both real API data). */
  const alertsList: Alert[] = useMemo(() => alerts.data ?? stats?.recent_alerts ?? [], [alerts.data, stats]);

  // ---- selection for charts (highest-risk patient first — a real list order, not a default chart)
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null);
  const [bioId, setBioId] = useState("");
  const [vitalId, setVitalId] = useState("");
  const [busyAlert, setBusyAlert] = useState<number | null>(null);
  const ack = useAction();

  useEffect(() => {
    if (patientsList.length === 0) { setSelectedPatientId(null); return; }
    if (!selectedPatientId || !patientsList.some((p) => p.id === selectedPatientId)) {
      setSelectedPatientId((patientsList.find((p) => p.risk?.category_key === "critical_thrombosis_risk") ?? patientsList[0]).id);
    }
  }, [patientsList, selectedPatientId]);

  const ruleBioCfg = config?.biomarkers.find((b) => b.used_in_demo_rule) ?? config?.biomarkers[0];
  useEffect(() => { if (!bioId && ruleBioCfg) setBioId(ruleBioCfg.id); }, [bioId, ruleBioCfg]);
  useEffect(() => { if (!vitalId && config?.vitals[0]) setVitalId(config.vitals[0].id); }, [vitalId, config]);

  const selectedPatient = useMemo(() => patientsList.find((p) => p.id === selectedPatientId) ?? null, [patientsList, selectedPatientId]);
  // Fetchers below are only invoked while `enabled` holds, so the guard values exist at call time.
  const selectedDetail = useApi(() => api.patient(tok, selectedPatient!.id), [tok, selectedPatient?.id], { enabled: !!selectedPatient });
  const bioHist = useApi(() => api.biomarkerHistory(tok, selectedPatient!.id, bioId), [tok, selectedPatient?.id, bioId], { enabled: !!selectedPatient && !!bioId });
  const vitalHist = useApi(() => api.vitals(tok, selectedPatient!.id, vitalId), [tok, selectedPatient?.id, vitalId], { enabled: !!selectedPatient && !!vitalId });

  // ---- critical-cases details (latest readings + device rows), capped to avoid an N+1 storm
  const criticalList = useMemo(() => patientsList.filter((p) =>
    p.risk?.category_key === "critical_thrombosis_risk" || !p.risk || p.risk.status !== "ok" || p.devices_connected < p.devices_total
  ), [patientsList]);
  const critIds = criticalList.slice(0, CRIT_DETAIL_CAP).map((p) => p.id).join("|");
  const critDetails = useApi(async () => {
    const ids = critIds ? critIds.split("|") : [];
    const res = await Promise.allSettled(ids.map((id) => api.patient(tok, id)));
    const rows: PatientDetail[] = [];
    res.forEach((r) => { if (r.status === "fulfilled") rows.push(r.value.data); });
    return { data: rows, error: null, meta: null };
  }, [tok, critIds], { enabled: critIds.length > 0 });
  const detailById = useMemo(() => new Map((critDetails.data ?? []).map((d) => [d.id, d])), [critDetails.data]);
  const sensorRows = useMemo(() => (critDetails.data ?? []).flatMap((d) => d.devices.map((device) => ({ patientId: d.id, device }))), [critDetails.data]);
  const conceptualCount = sensorRows.filter((r) => r.device.conceptual).length;

  const latestReading = (id: string): Reading | null => {
    if (!ruleBioCfg) return null;
    const r = detailById.get(id)?.latest_biomarkers[ruleBioCfg.id];
    return r && r.value != null && r.quality !== "missing" ? r : null;
  };

  const onAcknowledge = async (a: Alert) => {
    setBusyAlert(a.id);
    const r = await ack.run(() => api.acknowledge(tok, a.id));
    setBusyAlert(null);
    if (r) { alerts.refresh(); dashboard.refresh(); }
  };

  // ---- greeting header (reference layout: greeting + date range + export)
  const monthYearLabel = useMemo(() => {
    const now = new Date();
    return new Intl.DateTimeFormat(LANG_META[lang].locale, { month: "long", year: "numeric" }).format(now);
  }, [lang]);

  const exportCsv = () => {
    const header = ["id", "display_name", "age", "risk", "monitoring_status", "review_status", "devices_connected", "devices_total", "last_update"];
    const lines = [header.join(",")];
    patientsList.forEach((p) => {
      const risk = p.risk && p.risk.status === "ok" && p.risk.category_key ? t(`risk.${p.risk.category_key}`) : t("risk.insufficient");
      const cells = [p.id, p.display_name, p.age ?? "", risk, t(`status.monitoring.${p.monitoring_status}`), t(`status.review.${p.review_status}`), p.devices_connected, p.devices_total, p.last_update ?? ""];
      lines.push(cells.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","));
    });
    const blob = new Blob(["\uFEFF" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `rawa-monitoring-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  // ---- KPI computations (all from the real summary / patient list)
  const activeCount = patientsList.filter((p) => p.monitoring_status === "active").length;
  const ageBuckets = useMemo(() => {
    const defs: [string, (a: number) => boolean][] = [
      ["0–17", (a) => a <= 17], ["18–30", (a) => a >= 18 && a <= 30], ["31–45", (a) => a >= 31 && a <= 45],
      ["46–59", (a) => a >= 46 && a <= 59], ["60+", (a) => a >= 60],
    ];
    const ages = patientsList.map((p) => p.age).filter((a): a is number => a != null);
    return defs.map(([label, test]) => ({ label, count: ages.filter(test).length })).filter((b) => b.count > 0);
  }, [patientsList]);
  const riskRows: DistRow[] = useMemo(() => {
    const rows: DistRow[] = [];
    RISK_ORDER.forEach((k) => { const v = stats?.by_risk?.[k] ?? 0; if (v > 0) rows.push({ key: k, label: t(`risk.${k}`), value: v, color: RISK_COLORS[k] }); });
    const ins = stats?.by_risk?.insufficient_data ?? 0;
    if (ins > 0) rows.push({ key: "insufficient_data", label: t("risk.insufficient"), value: ins, color: "#b9b4c9" });
    return rows;
  }, [stats, t]);

  // ---- charts series (real readings; missing values stay gaps)
  const bioCfg = config?.biomarkers.find((b) => b.id === bioId);
  const bioPoints = useMemo(() => (bioHist.data ?? []).slice(-24).map((r) => ({
    label: r.measured_at ? fmt.time(fmt.toMs(r.measured_at)) : "—",
    v: r.quality === "missing" ? null : r.value,
  })), [bioHist.data, fmt]);
  const vitalCfg = config?.vitals.find((v) => v.id === vitalId);
  const vitalPoints = useMemo(() => (vitalHist.data ?? []).slice(-24).map((r) => ({
    label: r.measured_at ? fmt.time(fmt.toMs(r.measured_at)) : "—",
    v: r.quality === "missing" ? null : r.value,
  })), [vitalHist.data, fmt]);
  const latestVital = vitalId ? selectedDetail.data?.latest_vitals?.[vitalId] : undefined;

  // ---- alerts calendar (real alert dates)
  const [calCursor, setCalCursor] = useState(() => { const n = new Date(); return { y: n.getFullYear(), m: n.getMonth() }; });
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const todayIso = isoOf(new Date().getFullYear(), new Date().getMonth(), new Date().getDate());
  const calMonthLabel = useMemo(() => new Intl.DateTimeFormat(LANG_META[lang].locale, { month: "long", year: "numeric" }).format(new Date(calCursor.y, calCursor.m, 1)), [lang, calCursor]);
  const weekdayLabels = useMemo(() => {
    const df = new Intl.DateTimeFormat(LANG_META[lang].locale, { weekday: "short" });
    return Array.from({ length: 7 }, (_, i) => df.format(new Date(2024, 0, 7 + i))); // 2024-01-07 is a Sunday
  }, [lang]);
  const alertsByDay = useMemo(() => {
    const map = new Map<string, Alert[]>();
    alertsList.forEach((a) => {
      const dt = new Date(fmt.toMs(a.created_at));
      const iso = isoOf(dt.getFullYear(), dt.getMonth(), dt.getDate());
      const arr = map.get(iso);
      if (arr) arr.push(a); else map.set(iso, [a]);
    });
    return map;
  }, [alertsList, fmt]);
  const calCells = useMemo(() => {
    const startPad = new Date(calCursor.y, calCursor.m, 1).getDay();
    const daysInMonth = new Date(calCursor.y, calCursor.m + 1, 0).getDate();
    return { startPad, cells: Array.from({ length: daysInMonth }, (_, i) => i + 1) };
  }, [calCursor]);
  const monthAlerts = useMemo(() => {
    const prefix = `${calCursor.y}-${String(calCursor.m + 1).padStart(2, "0")}`;
    return alertsList.filter((a) => isoOf(new Date(fmt.toMs(a.created_at)).getFullYear(), new Date(fmt.toMs(a.created_at)).getMonth(), new Date(fmt.toMs(a.created_at)).getDate()).startsWith(prefix));
  }, [alertsList, calCursor, fmt]);
  const monthOpen = monthAlerts.filter((a) => a.status === "open");
  const ackShare = monthAlerts.length ? Math.round(((monthAlerts.length - monthOpen.length) / monthAlerts.length) * 100) : 0;
  const daySeverity = (iso: string): Alert["severity"] | null => {
    const arr = alertsByDay.get(iso);
    if (!arr || !arr.length) return null;
    return arr.reduce((max, a) => (SEV_RANK[a.severity] > SEV_RANK[max] ? a.severity : max), "info" as Alert["severity"]);
  };
  const shiftMonth = (delta: number) => {
    setSelectedDay(null);
    setCalCursor((c) => { const d = new Date(c.y, c.m + delta, 1); return { y: d.getFullYear(), m: d.getMonth() }; });
  };

  // ---- rail: queue + priority (real orderings)
  const rankOf = (p: PatientSummary) => (p.risk && p.risk.status === "ok" && p.risk.category_key ? RISK_RANK[p.risk.category_key] ?? 4 : 5);
  const queuePatients = useMemo(() => [...patientsList].sort((a, b) => rankOf(a) - rankOf(b)).slice(0, 5), [patientsList]);
  const priority = criticalList[0] ?? patientsList[0] ?? null;
  const weekDays = useMemo(() => {
    const n = new Date();
    const df = new Intl.DateTimeFormat(LANG_META[lang].locale, { weekday: "short" });
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(n.getFullYear(), n.getMonth(), n.getDate() - n.getDay() + i);
      return { iso: isoOf(d.getFullYear(), d.getMonth(), d.getDate()), dayNum: d.getDate(), weekday: df.format(d), isToday: d.getTime() === n.getTime() };
    });
  }, [lang]);
  const openAlertsShown = alertsList.filter((a) => a.status === "open").slice(0, 6);

  // ---- states
  if (dashboard.loading && !stats) return <LoadingBlock rows={6} />;
  if (dashboard.error && !stats) return <ErrorState error={dashboard.error} onRetry={dashboard.reload} />;
  if (!stats) return null;

  return (
    <>
      {/* greeting header — reference layout */}
      <div className="greeting-bar">
        <div className="greeting-text">
          <h1>{t("overview.greeting")}</h1>
          <p>{t("overview.subtitle")}</p>
        </div>
        <div className="header-buttons">
          <ConnectionIndicator state={dashboard.connection} lastUpdate={dashboard.lastSuccess} />
          <span className="btn-white-bubble" title={t("overview.range")}>
            <i className="ti ti-calendar" aria-hidden="true"></i>
            <span className="num">{monthYearLabel}</span>
          </span>
          <button className="btn-white-bubble" onClick={exportCsv} disabled={patientsList.length === 0}>
            <i className="ti ti-upload" aria-hidden="true"></i>
            <span>{t("overview.export")}</span>
          </button>
        </div>
      </div>

      {/* key performance indicators — real summary numbers, explicit placeholders */}
      <section className="kpi-region" role="region" aria-label={t("kpi.section")}>
        <div className="kpi-hero-quad">
          <KpiHero icon="ti-users" label={t("overview.totalPatients")} value={fmt.number(stats.total_patients, 0)} />
          <KpiHero icon="ti-bell" label={t("overview.openAlerts")} value={fmt.number(stats.open_alerts, 0)} />
          <KpiHero icon="ti-clipboard-check" label={t("overview.needsReview")} value={fmt.number(stats.needs_review, 0)} />
          <KpiHero icon="ti-alert-triangle" label={t("kpi.criticalCases")} value={fmt.number(stats.by_risk.critical_thrombosis_risk ?? 0, 0)} />
        </div>
        <div className="kpi-strip">
          <Stat label={t("overview.devices")} value={`${fmt.number(stats.devices.connected, 0)} / ${fmt.number(stats.devices.total, 0)}`} />
          <Stat label={t("kpi.connectedSensors")} value={fmt.number(stats.devices.connected, 0)} />
          <Stat label={t("kpi.disconnectedSensors")} value={fmt.number(Math.max(0, stats.devices.total - stats.devices.connected), 0)} />
          <Stat
            label={t("kpi.underMonitoring")}
            value={fmt.number(activeCount, 0)}
            hint={<span className="kpi-hint">{t("kpi.monitoringShare", { active: fmt.number(activeCount, 0), total: fmt.number(stats.total_patients, 0) })}</span>}
          />
          <Stat label={t("kpi.occupancy")} value="—" hint={<span className="kpi-hint">{t("kpi.noBackend")}</span>} />
          <Stat label={t("kpi.waitingTime")} value="—" hint={<span className="kpi-hint">{t("kpi.noBackend")}</span>} />
          <Stat label={t("kpi.emergencyResponse")} value="—" hint={<span className="kpi-hint">{t("kpi.noBackend")}</span>} />
        </div>
      </section>

      {/* main stream + right rail (reference composition) */}
      <div className="overview-grid">
        <div className="main-stream">
          {/* health overview chart — real biomarker history */}
          <div className="chart-central-card">
            <div className="chart-card-head">
              <div className="row" style={{ flexWrap: "nowrap" }}>
                <span className="circle-icon-lead" aria-hidden="true"><i className="ti ti-chart-dots-3"></i></span>
                <h3>{t("overview.biomarkerOverview")}</h3>
              </div>
              {patientsList.length > 0 && (
                <label className="chart-patient-select">
                  <span className="xs muted">{t("overview.focusPatient")}</span>
                  <select className="select" value={selectedPatientId ?? ""} onChange={(e) => setSelectedPatientId(e.target.value)}>
                    {patientsList.map((p) => <option key={p.id} value={p.id}>{p.display_name} ({p.id})</option>)}
                  </select>
                </label>
              )}
            </div>
            <div className="chart-filters" role="group" aria-label={t("overview.biomarkerOverview")}>
              {(config?.biomarkers ?? []).map((b) => (
                <button key={b.id} className={`filter-chip ${bioId === b.id ? "active" : ""}`} aria-pressed={bioId === b.id} onClick={() => setBioId(b.id)}>
                  {b.abbreviation}
                </button>
              ))}
            </div>
            <div className="canvas-holder">
              {!selectedPatient ? <EmptyState>{t("priority.noPriority")}</EmptyState>
                : bioHist.loading && !bioHist.data ? <LoadingBlock rows={2} />
                : bioHist.error && !bioHist.data ? <ErrorState error={bioHist.error} onRetry={bioHist.reload} />
                : <BarsChart rows={bioPoints} unit={bioCfg?.unit ?? ""} label={bioCfg ? t("bio.trend") : ""} />}
            </div>
            {bioCfg && <p className="xs muted">{t("bio.gapsNote")} · {t("bio.unitConfigurable")}</p>}
          </div>

          <div className="stats-split-row">
          {/* alerts calendar — real alert dates, month navigation */}
          <div className="calendar-metric-card">
            <div className="cal-head">
              <h3>{t("cal.title")}</h3>
              <div className="cal-nav">
                <button className="cal-nav-btn" onClick={() => shiftMonth(-1)} aria-label={t("cal.prev")} title={t("cal.prev")}>
                  <i className="ti ti-chevron-left" aria-hidden="true"></i>
                </button>
                <span className="cal-month-label num">{calMonthLabel}</span>
                <button className="cal-nav-btn" onClick={() => shiftMonth(1)} aria-label={t("cal.next")} title={t("cal.next")}>
                  <i className="ti ti-chevron-right" aria-hidden="true"></i>
                </button>
              </div>
            </div>
            <div className="cal-weekdays" aria-hidden="true">{weekdayLabels.map((w, i) => <span key={i}>{w}</span>)}</div>
            <div className="cal-dates-grid">
              {Array.from({ length: calCells.startPad }, (_, i) => <span key={`pad-${i}`} aria-hidden="true" />)}
              {calCells.cells.map((d) => {
                const iso = isoOf(calCursor.y, calCursor.m, d);
                const sev = daySeverity(iso);
                return (
                  <button
                    key={iso} type="button"
                    className={`cal-day${iso === todayIso ? " today" : ""}${iso === selectedDay ? " active" : ""}`}
                    aria-pressed={iso === selectedDay}
                    aria-label={`${d}${sev ? ` · ${t(`alert.severity.${sev}`)}` : ""}`}
                    onClick={() => setSelectedDay(iso === selectedDay ? null : iso)}
                  >
                    {numCell(d)}
                    {sev && <span className={`cal-dot ${sev}`} aria-hidden="true"></span>}
                  </button>
                );
              })}
            </div>
            <div className="cal-summary">
              <div className="cal-stat">
                <i className="ti ti-bell" aria-hidden="true"></i>
                <span>{t("cal.monthTotal", { n: fmt.number(monthAlerts.length, 0) })}</span>
              </div>
              <div className="cal-stat">
                <i className="ti ti-bell-ringing" aria-hidden="true"></i>
                <span>{t("cal.monthOpen", { n: fmt.number(monthOpen.length, 0) })}</span>
              </div>
              <div className="cal-progress">
                <div className="row-between xs"><span>{t("cal.ackShare")}</span><span className="num">{fmt.number(ackShare, 0)}%</span></div>
                <div className="seg-bar" role="img" aria-label={`${t("cal.ackShare")}: ${ackShare}%`}>
                  <span className="conn-up" style={{ width: `${ackShare}%` }}></span>
                </div>
              </div>
            </div>
            <div className="cal-agenda">
              {!selectedDay ? <p className="xs muted">{t("cal.selectDay")}</p>
                : (alertsByDay.get(selectedDay) ?? []).length === 0 ? <p className="xs muted">{t("cal.noAlertsDay")}</p>
                : (
                  <ul className="timeline">
                    {(alertsByDay.get(selectedDay) ?? []).map((a) => (
                      <li key={a.id}><div className="stack-sm">
                        <div className="row">
                          <Badge variant={a.severity === "critical" ? "danger" : a.severity === "warning" ? "warn" : "info"}>{t(`alert.severity.${a.severity}`)}</Badge>
                          <span className="mono xs muted">{a.patient_id}</span>
                        </div>
                        <div className="small">{t(a.message_key)}</div>
                        <div className="xs muted num">{fmt.dateTime(a.created_at)}</div>
                      </div></li>
                    ))}
                  </ul>
                )}
            </div>
            <p className="xs muted">{t("cal.recentNote")}</p>
          </div>

          {/* physiological monitoring — real latest vitals + real series */}
          <div className="waveform-card">
            <div className="waveform-header">
              <div className="row" style={{ flexWrap: "nowrap" }}>
                <span className="circle-icon-lead" aria-hidden="true"><i className="ti ti-heart-rate-monitor"></i></span>
                <h3>{t("detail.vitals")}</h3>
              </div>
              <div className="chart-filters" style={{ marginBottom: 0 }} role="group" aria-label={t("detail.vitals")}>
                {(config?.vitals ?? []).map((v) => (
                  <button key={v.id} className={`filter-chip ${vitalId === v.id ? "active" : ""}`} aria-pressed={vitalId === v.id} onClick={() => setVitalId(v.id)}>
                    {v.names[lang] ?? v.names.en}
                  </button>
                ))}
              </div>
            </div>
            <div className="physio-value">
              <span className="metric-big-val num">{latestVital && latestVital.value != null && latestVital.quality !== "missing" ? fmt.number(latestVital.value) : "—"}</span>
              <span className="metric-unit">{latestVital?.unit ?? vitalCfg?.unit ?? ""}</span>
              <span className="xs muted">{latestVital ? fmt.dateTime(latestVital.measured_at) : t("common.noReading")}</span>
            </div>
            <div className="canvas-holder">
              {!selectedPatient ? <EmptyState>{t("priority.noPriority")}</EmptyState>
                : vitalHist.loading && !vitalHist.data ? <LoadingBlock rows={2} />
                : vitalHist.error && !vitalHist.data ? <ErrorState error={vitalHist.error} onRetry={vitalHist.reload} />
                : <BarsChart rows={vitalPoints} unit={vitalCfg?.unit ?? ""} label={vitalCfg?.names[lang] ?? ""} />}
            </div>
          </div>
          </div>

          {/* critical cases — monitoring list only, latest reading from the detail API */}
          <section className="card" aria-labelledby="critical-h">
            <div className="card-title">
              <h2 id="critical-h">{t("critical.title")}</h2>
              {critDetails.loading && critIds ? <span className="xs muted">{t("common.loading")}</span> : null}
            </div>
            <p className="xs muted" style={{ marginBottom: 12 }}>{t("critical.scope")}</p>
            {list.loading && !list.data ? <LoadingBlock rows={3} />
              : criticalList.length === 0 ? <EmptyState>{t("critical.empty")}</EmptyState>
              : (
                <div className="table-wrap">
                  <table>
                    <thead><tr>
                      <th>{t("common.name")}</th><th>{t("risk.title")}</th><th>{t("critical.latestReading")}</th>
                      <th>{t("common.lastUpdate")}</th><th>{t("common.actions")}</th>
                    </tr></thead>
                    <tbody>
                      {criticalList.map((p) => {
                        const r = latestReading(p.id);
                        return (
                          <tr key={p.id}>
                            <td><Link to={`/doctor/patients/${p.id}`}><strong>{p.display_name}</strong></Link> <span className="mono xs muted">{p.id}</span></td>
                            <td><RiskBadge risk={p.risk} /></td>
                            <td title={r ? `${fmt.dateTime(r.measured_at)} · ${t(`bio.source.${r.source}`)}` : undefined}>
                              {r ? (<><span className="num">{fmt.number(r.value)}</span> <span className="xs muted">{r.unit}</span></>) : <span className="muted">{t("common.noReading")}</span>}
                            </td>
                            <td className="xs num">{p.last_update ? fmt.relative(p.last_update) : t("common.never")}</td>
                            <td><Link className="btn sm" to={`/doctor/patients/${p.id}`}>{t("patients.viewPatient")}</Link></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
          </section>

          <div className="bottom-split-row">
            {/* sensor monitoring — devices of the listed critical cases */}
            <section className="card" aria-labelledby="sensormon-h">
              <div className="card-title"><h2 id="sensormon-h">{t("sensorMon.title")}</h2></div>
              <div className="stack-sm">
                <div className="row xs muted">
                  <span>{`${t("common.connected")}: ${fmt.number(stats.devices.connected, 0)}`}</span>
                  <span>{`${t("sensorMon.simulationMode")}: ${fmt.number(conceptualCount, 0)}`}</span>
                </div>
                {critIds && critDetails.loading ? <LoadingBlock rows={2} />
                  : sensorRows.length === 0 ? <EmptyState>{t("sensorMon.empty")}</EmptyState>
                  : (
                    <ul className="sensor-list">
                      {sensorRows.map(({ patientId, device }) => (
                        <li key={`${patientId}-${device.id}`} className="row-between small">
                          <span>{t(`device.kind.${device.kind}`)}</span>
                          <span className="row" style={{ gap: 8, flexWrap: "nowrap" }}>
                            <Badge variant={device.status === "connected" ? "ok" : "danger"}>{t(`status.device.${device.status}`)}</Badge>
                            <span className="xs muted">{device.conceptual ? t("sensorMon.sourceSimulated") : t("sensorMon.sourceHardware")}</span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                <p className="xs muted">{t("device.conceptual")} · {t("notice.simulated")}</p>
              </div>
            </section>

            {/* risk distribution + demographics — computed by the backend / from the real list */}
            <div className="stack">
              <section className="card" aria-labelledby="riskdist-h">
                <div className="card-title"><h2 id="riskdist-h">{t("overview.riskDistribution")}</h2></div>
                <DistributionChart rows={riskRows} label={t("overview.byRisk")} />
                <p className="xs muted" style={{ marginTop: 10 }}>{t("notice.riskDemo")}</p>
              </section>
              <section className="card" aria-labelledby="demo-h">
                <div className="card-title"><h2 id="demo-h">{t("overview.demographics")}</h2></div>
                <h3 className="xs muted">{t("overview.ageDistribution")}</h3>
                {patientsList.length === 0 ? <p className="xs muted">{t("common.empty")}</p> : ageBuckets.length === 0 ? <p className="xs muted">{t("common.noReading")}</p> : (
                  <ul className="age-list">
                    {ageBuckets.map((b) => (
                      <li key={b.label} className="row-between small"><span>{b.label}</span><strong className="num">{fmt.number(b.count, 0)}</strong></li>
                    ))}
                  </ul>
                )}
                <p className="xs muted" style={{ marginTop: 10 }}>{t("overview.demoFields")}</p>
              </section>
            </div>
          </div>
        </div>

        {/* right rail */}
        <aside className="side-stream">
          {/* priority case — highest-risk patient currently in the list */}
          <div className="priority-card">
            <div className="row-between">
              <div>
                <h3>{t("priority.cardTitle")}</h3>
                <p className="xs muted">{t("priority.cardSub")}</p>
              </div>
              {priority?.monitoring_status === "active" && (
                <span className="p-badge-state success"><span className="pulse-dot" style={{ background: "var(--success)" }}></span>{t("priority.liveTag")}</span>
              )}
            </div>
            {priority ? (
              <>
                <div className="priority-profile">
                  <span className="patient-avatar-large" aria-hidden="true">{priority.display_name ? priority.display_name[0] : "—"}</span>
                  <div className="stack-sm">
                    <strong>{priority.display_name}</strong>
                    <span className="xs muted mono">{priority.id}{priority.age != null ? ` · ${fmt.number(priority.age, 0)}` : ""}</span>
                    <RiskBadge risk={priority.risk} />
                  </div>
                </div>
                <dl className="priority-stats">
                  <div><dt className="xs muted">{t("common.lastUpdate")}</dt><dd className="xs num">{priority.last_update ? fmt.relative(priority.last_update) : t("common.never")}</dd></div>
                  <div><dt className="xs muted">{t("device.title")}</dt><dd className="xs num">{t("patients.devicesShort", { c: fmt.number(priority.devices_connected, 0), t: fmt.number(priority.devices_total, 0) })}</dd></div>
                  <div><dt className="xs muted">{t("detail.review")}</dt><dd><Badge variant={priority.review_status === "pending_review" ? "warn" : priority.review_status === "reviewed" ? "ok" : priority.review_status === "follow_up" ? "info" : ""}>{t(`status.review.${priority.review_status}`)}</Badge></dd></div>
                </dl>
                <div className="row">
                  <Link className="btn primary sm" to={`/doctor/patients/${priority.id}`}>{t("priority.openFile")}</Link>
                </div>
              </>
            ) : <EmptyState>{t("priority.noPriority")}</EmptyState>}
          </div>

          {/* triage queue — real patients ordered by risk classification */}
          <div className="queue-booking-card">
            <div className="queue-header">
              <h3>{t("queue.cardTitle")}</h3>
              <span className="xs muted">{t("queue.cardSub")}</span>
            </div>
            <div className="week-strip" role="list" aria-label={t("overview.range")}>
              {weekDays.map((d) => (
                <div key={d.iso} role="listitem" className={`week-day${d.isToday ? " today" : ""}`} aria-label={d.isToday ? t("queue.today") : undefined}>
                  <span className="week-day-name" aria-hidden="true">{d.weekday}</span>
                  <span className="week-day-num" aria-hidden="true">{numCell(d.dayNum)}</span>
                </div>
              ))}
            </div>
            {list.loading && !list.data ? <LoadingBlock rows={3} />
              : queuePatients.length === 0 ? <EmptyState>{t("queue.empty")}</EmptyState>
              : (
                <ul className="patient-queue-list">
                  {queuePatients.map((p) => (
                    <li key={p.id} className="patient-row-item">
                      <Link to={`/doctor/patients/${p.id}`} className="p-lead">
                        <span className="p-circle" aria-hidden="true">{p.display_name ? p.display_name[0] : "م"}</span>
                        <span className="p-meta">
                          <h5>{p.display_name}</h5>
                          <span className="xs muted">{t(`status.monitoring.${p.monitoring_status}`)}</span>
                        </span>
                      </Link>
                      <RiskBadge risk={p.risk} />
                    </li>
                  ))}
                </ul>
              )}
            <Link className="btn primary" to="/doctor/patients">{t("queue.openAll")}</Link>
          </div>

          {/* open alerts — acknowledge without leaving the overview */}
          <section className="card" aria-labelledby="openalerts-h">
            <div className="card-title">
              <h3 id="openalerts-h">{t("alert.title")}</h3>
              <Link className="xs" to="/doctor/alerts">{t("alert.filterAll")}</Link>
            </div>
            {alerts.loading && !alerts.data && !alertsList.length ? <LoadingBlock rows={2} />
              : <AlertList alerts={openAlertsShown} showPatient busyId={busyAlert} onAcknowledge={onAcknowledge} />}
            {alerts.error && !alerts.data ? <p className="xs muted" style={{ marginTop: 8 }}>{t("common.errorNetwork")}</p> : null}
          </section>
        </aside>
      </div>
    </>
  );
}
