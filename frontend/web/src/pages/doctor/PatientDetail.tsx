import { useMemo, useState, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../../api/endpoints";
import type { Alert, BiomarkerConfig, Note, Proposal } from "../../api/types";
import { useSession } from "../../auth/session";
import { useI18n } from "../../i18n";
import { useApi } from "../../hooks/useApi";
import { useAction } from "../../hooks/useAction";
import { useConfig } from "../../hooks/useConfig";
import { AlertList } from "../../components/AlertList";
import { BiomarkerDetailDialog, BiomarkerTrends } from "../../components/BiomarkersPanel";
import { AvailabilityBars, ConnectionTimeline, RiskTimeline } from "../../components/Charts";
import { DailyAnalysis } from "../../components/DailyAnalysis";
import { BiomarkerCard, DeviceList, RangeSelect, VitalCard } from "../../components/Measurements";
import { PatientFormDialog, type PatientFormValues } from "../../components/PatientForm";
import { EmergencyPanel, ProposalCard } from "../../components/ProposalCard";
import { RiskPanel } from "../../components/RiskPanel";
import { SimPatientTools } from "../../components/SimTools";
import { ConnectionIndicator, RiskBadge } from "../../components/shared";
import { Badge, Card, EmptyState, ErrorState, Field, LoadingBlock } from "../../components/ui";

type TabKey = "overview" | "biomarkers" | "vitals" | "activity" | "risk" | "sensor";
const TABS: TabKey[] = ["overview", "biomarkers", "vitals", "activity", "risk", "sensor"];

export default function PatientDetailPage() {
  const { id = "" } = useParams();
  const { t, fmt, name } = useI18n();
  const { session } = useSession();
  const tok = session?.token ?? null;
  const { config } = useConfig();
  const [range, setRange] = useState<number | undefined>(undefined);
  const [editing, setEditing] = useState(false);
  const [busyAlert, setBusyAlert] = useState<number | null>(null);
  const [tab, setTab] = useState<TabKey>("overview");
  const [bioDetail, setBioDetail] = useState<BiomarkerConfig | null>(null);

  const detail = useApi(() => api.patient(tok, id), [tok, id], { pollMs: 5000 });
  const riskHist = useApi(() => api.riskHistory(tok, id), [tok, id, detail.data?.risk?.id], {});
  const devHist = useApi(() => api.deviceHistory(tok, id), [tok, id, detail.data?.devices.map((d) => d.status).join()], {});
  const alerts = useApi(() => api.alerts(tok, { patient_id: id }), [tok, id, detail.data?.recent_alerts[0]?.id, detail.data?.review_status], { pollMs: 5000 });
  const notes = useApi(() => api.notes(tok, id), [tok, id]);
  const proposals = useApi(() => api.proposals(tok, id), [tok, id, detail.data?.risk?.id], { pollMs: 5000 });
  const save = useAction();
  const ack = useAction();
  const resolve = useAction();
  const noteAction = useAction();
  const [noteBody, setNoteBody] = useState("");
  const [noteStatus, setNoteStatus] = useState("");
  const [noteError, setNoteError] = useState<string | null>(null);

  const refreshAll = () => { detail.refresh(); riskHist.refresh(); devHist.refresh(); alerts.refresh(); proposals.refresh(); notes.refresh(); };

  const activity = useMemo(() => {
    const items: { ts: string; kind: "alert" | "note" | "proposal"; node: React.ReactNode }[] = [];
    (alerts.data ?? []).forEach((a: Alert) => items.push({ ts: a.created_at, kind: "alert", node: <><Badge variant="info">{t("alert.title")}</Badge> {t(a.message_key)} <span className="xs muted">({t("detail.generatedDemo")})</span></> }));
    (notes.data ?? []).forEach((n: Note) => items.push({ ts: n.created_at, kind: "note", node: <><Badge variant="primary">{t("detail.enteredByDoctor")}</Badge> {n.body}</> }));
    (proposals.data ?? []).forEach((p: Proposal) => items.push({ ts: p.created_at, kind: "proposal", node: <><Badge variant="warn">{t("proposal.title")}</Badge> {t(`proposal.status.${p.status}`)} <span className="xs muted">({t("detail.generatedDemo")})</span></> }));
    return items.sort((a, b) => fmt.toMs(b.ts) - fmt.toMs(a.ts)).slice(0, 20);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alerts.data, notes.data, proposals.data, t, fmt]);

  if (detail.loading && !detail.data) return <LoadingBlock rows={6} />;
  if (detail.error && !detail.data) {
    const nf = detail.error.status === 404;
    return <div className="stack"><Link to="/doctor/patients">← {t("detail.backToList")}</Link>{nf ? <EmptyState>{t("detail.notFound")}</EmptyState> : <ErrorState error={detail.error} onRetry={detail.reload} />}</div>;
  }
  const p = detail.data!;
  const quality = p.risk?.details.data_quality.markers ?? {};
  const availability = (config?.biomarkers ?? []).map((b) => ({ id: b.id, label: `${name(b.names)} (${b.abbreviation})`, valid: quality[b.id]?.valid_points ?? 0, total: quality[b.id]?.window_points ?? 0 }));
  // Patch/sensor status summary: newest connection-log entry and newest stored reading of this patient.
  const lastSync = (devHist.data ?? []).reduce<string | null>((acc, h) => (!acc || fmt.toMs(h.ts) > fmt.toMs(acc) ? h.ts : acc), null);
  const lastReading = p.devices.reduce<string | null>((acc, d) => (d.last_reading_at && (!acc || fmt.toMs(d.last_reading_at) > fmt.toMs(acc)) ? d.last_reading_at : acc), null);

  const update = async (v: PatientFormValues) => {
    const r = await save.run(() => api.updatePatient(tok, id, { display_name: v.display_name, age: v.age, clinical_context: v.clinical_context, monitoring_status: v.monitoring_status }));
    if (r) { setEditing(false); refreshAll(); }
  };
  const submitNote = async () => {
    if (!noteBody.trim()) { setNoteError(t("common.required")); return; }
    setNoteError(null);
    const r = await noteAction.run(() => api.addNote(tok, id, { body: noteBody.trim(), review_status: noteStatus || null }));
    if (r) { setNoteBody(""); setNoteStatus(""); refreshAll(); }
  };

  // ---- sections (only one tab panel is mounted at a time) ----
  const infoCard = (
    <Card title={t("detail.info")}>
      <dl style={{ margin: 0, display: "grid", gridTemplateColumns: "auto 1fr", gap: "6px 16px" }}>
        <dt className="muted">{t("detail.patientId")}</dt><dd className="mono" style={{ margin: 0 }}>{p.id}</dd>
        <dt className="muted">{t("common.age")}</dt><dd className="num" style={{ margin: 0 }}>{p.age ?? "—"}</dd>
        <dt className="muted">{t("detail.gender")}</dt><dd style={{ margin: 0 }}>{t("detail.notRecorded")}</dd>
        <dt className="muted">{t("detail.department")}</dt><dd style={{ margin: 0 }}>{t("detail.notRecorded")}</dd>
        <dt className="muted">{t("detail.context")}</dt><dd style={{ margin: 0 }}>{p.clinical_context || "—"}</dd>
        <dt className="muted">{t("detail.sensorStatus")}</dt>
        <dd style={{ margin: 0 }}>
          <Badge variant={p.devices_connected === p.devices_total ? "ok" : "danger"}>
            {p.devices_connected === p.devices_total ? t("status.device.connected") : t("status.device.disconnected")}
            {" "}({fmt.number(p.devices_connected, 0)}/{fmt.number(p.devices_total, 0)})
          </Badge>
        </dd>
        <dt className="muted">{t("detail.monitoringStart")}</dt><dd className="num" style={{ margin: 0 }}>{fmt.dateTime(p.monitoring_start)}</dd>
        <dt className="muted">{t("common.lastUpdate")}</dt><dd className="num" style={{ margin: 0 }}>{p.last_update ? `${fmt.dateTime(p.last_update)} (${fmt.relative(p.last_update)})` : t("common.never")}</dd>
      </dl>
    </Card>
  );

  const deviceCard = (
    <Card title={t("device.title")}>
      <div className="stack">
        <div className="row xs muted" style={{ flexWrap: "wrap" }}>
          <span>{t("device.lastSync")}: <span className="num">{lastSync ? fmt.dateTime(lastSync) : t("common.never")}</span></span>
          <span>{t("sensorMon.mode")}: {p.devices.some((d) => d.conceptual) ? t("sensorMon.simulationMode") : t("sensorMon.hardwareMode")}</span>
          <span>{t("device.lastReading")}: <span className="num">{lastReading ? fmt.dateTime(lastReading) : t("common.never")}</span></span>
        </div>
        <DeviceList devices={p.devices} />
        <h3>{t("device.history")}</h3>
        {devHist.data ? <ConnectionTimeline history={devHist.data} deviceKinds={p.devices.map((d) => d.kind)} /> : <LoadingBlock rows={2} />}
      </div>
    </Card>
  );

  const riskHistCard = (
    <Card title={t("risk.history")}>
      <div className="stack">
        {riskHist.data ? <RiskTimeline items={riskHist.data} /> : <LoadingBlock rows={2} />}
        <h3>{t("bio.availability")}</h3>
        <AvailabilityBars rows={availability} />
      </div>
    </Card>
  );

  const bioSection = (
    <section className="stack" aria-labelledby="bio-h">
      <div className="row-between"><h2 id="bio-h">{t("detail.biomarkers")}</h2><RangeSelect value={range} onChange={setRange} /></div>
      <p className="xs muted">{t("bio.unitConfigurable")}</p>
      <div className="grid-2">
        {(config?.biomarkers ?? []).map((b) => <BiomarkerCard key={b.id} cfg={b} reading={p.latest_biomarkers[b.id]} devices={p.devices} patientId={p.id} range={range} onDetails={setBioDetail} />)}
      </div>
    </section>
  );

  // Biomarker Trends + Reading History for this patient only (24 h window, existing history API).
  const trendsSection = (config?.biomarkers ?? []).length > 0 && (
    <BiomarkerTrends patientId={p.id} biomarkers={config!.biomarkers} devices={p.devices} onDetails={setBioDetail} />
  );

  const dailyCard = <DailyAnalysis patient={p} riskHistory={riskHist.data} deviceHistory={devHist.data} />;

  const vitalsSection = (
    <section className="stack" aria-labelledby="vit-h">
      <h2 id="vit-h">{t("detail.vitals")}</h2>
      <div className="grid-2">{(config?.vitals ?? []).map((v) => <VitalCard key={v.id} cfg={v} reading={p.latest_vitals[v.id]} patientId={p.id} />)}</div>
    </section>
  );

  const alertsGrid = (
    <div className="grid-2">
      <Card title={t("alert.title")}>
        {alerts.data ? <AlertList alerts={alerts.data} busyId={busyAlert} onAcknowledge={async (a) => { setBusyAlert(a.id); await ack.run(() => api.acknowledge(tok, a.id)); setBusyAlert(null); refreshAll(); }} /> : <LoadingBlock rows={2} />}
        {ack.error ? <ErrorState error={ack.error} /> : null}
      </Card>
      <div className="stack">
        <ProposalCard proposals={proposals.data ?? []} onResolve={async (pr, action) => { await resolve.run(() => action === "confirm" ? api.confirmProposal(tok, pr.id) : api.cancelProposal(tok, pr.id)); refreshAll(); }} />
        {resolve.error ? <ErrorState error={resolve.error} /> : null}
        <EmergencyPanel />
      </div>
    </div>
  );

  const activityCard = (
    <Card title={t("detail.activity")}>
      {activity.length === 0 ? <EmptyState>{t("detail.activityEmpty")}</EmptyState> : (
        <ul className="timeline">{activity.map((a, i) => <li key={`${a.kind}-${i}`}><div><div>{a.node}</div><div className="xs muted num">{fmt.dateTime(a.ts)}</div></div></li>)}</ul>
      )}
    </Card>
  );

  const reviewCard = (
    <Card title={t("detail.review")}>
      <div className="stack">
        <div className="notice xs">{t("detail.enteredByDoctor")}</div>
        <Field label={t("detail.note")} htmlFor="note-body" error={noteError}>
          <textarea id="note-body" className="textarea" value={noteBody} placeholder={t("detail.notePlaceholder")} maxLength={2000} onChange={(e) => setNoteBody(e.target.value)} />
        </Field>
        <Field label={t("detail.reviewStatus")} htmlFor="note-status">
          <select id="note-status" className="select" value={noteStatus} onChange={(e) => setNoteStatus(e.target.value)}>
            <option value="">{t("detail.noChange")}</option>
            {["pending_review", "reviewed", "follow_up"].map((s) => <option key={s} value={s}>{t(`status.review.${s}`)}</option>)}
          </select>
        </Field>
        <div><button className="btn primary" onClick={submitNote} disabled={noteAction.busy}>{t("detail.addNote")}</button></div>
        {noteAction.error ? <ErrorState error={noteAction.error} /> : null}
        <h3>{t("detail.note")}</h3>
        {(notes.data ?? []).length === 0 ? <p className="muted">{t("detail.noNotes")}</p> : (
          <ul className="timeline">{notes.data!.map((n) => (
            <li key={n.id}><div><div>{n.body}</div><div className="xs muted num">{fmt.dateTime(n.created_at)} · {t("detail.enteredByDoctor")} ({n.author_id}){n.review_status ? ` · ${t(`status.review.${n.review_status}`)}` : ""}</div></div></li>
          ))}</ul>
        )}
      </div>
    </Card>
  );

  const sensorTableCard = (
    <Card title={t("sensorMon.title")}>
      <div className="table-wrap">
        <table>
          <thead><tr>
            <th>{t("common.sensor")}</th><th>{t("common.status")}</th><th>{t("device.lastReading")}</th>
            <th>{t("sensorMon.lastConnection")}</th><th>{t("common.source")}</th>
          </tr></thead>
          <tbody>
            {p.devices.map((d) => {
              const logs = (devHist.data ?? []).filter((h) => h.device_id === d.id).sort((a, b) => fmt.toMs(a.ts) - fmt.toMs(b.ts));
              const last = logs.length ? logs[logs.length - 1].ts : null;
              return (
                <tr key={d.id}>
                  <td>{t(`device.kind.${d.kind}`)} <span className="xs muted">{d.name}</span></td>
                  <td><Badge variant={d.status === "connected" ? "ok" : "danger"}>{t(`status.device.${d.status}`)}</Badge></td>
                  <td className="xs num">{d.last_reading_at ? fmt.dateTime(d.last_reading_at) : t("common.never")}</td>
                  <td className="xs num">{last ? fmt.dateTime(last) : t("common.unknown")}</td>
                  <td className="xs">{d.conceptual ? t("sensorMon.sourceSimulated") : t("sensorMon.sourceHardware")}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="xs muted" style={{ marginTop: 12 }}>{t("device.conceptual")} · {t("notice.simulated")}</p>
    </Card>
  );

  const toolsCard = (
    <Card title={t("detail.tools")}>
      <div className="notice info xs" style={{ marginBottom: 12 }}>{t("sim.banner")}</div>
      <SimPatientTools patientId={p.id} onDone={refreshAll} />
    </Card>
  );

  const panels: Record<TabKey, ReactNode> = {
    overview: (
      <>
        <div className="grid-2">{infoCard}{deviceCard}</div>
        <div className="grid-2"><RiskPanel risk={p.risk} />{riskHistCard}</div>
        {bioSection}
        {trendsSection}
        {dailyCard}
        {vitalsSection}
        {alertsGrid}
        <div className="grid-2">{reviewCard}{activityCard}</div>
        {toolsCard}
      </>
    ),
    biomarkers: <>{bioSection}{trendsSection}</>,
    vitals: vitalsSection,
    activity: activityCard,
    risk: <div className="grid-2"><RiskPanel risk={p.risk} />{riskHistCard}</div>,
    sensor: <>{deviceCard}{sensorTableCard}</>,
  };

  return (
    <>
      <Link to="/doctor/patients">← {t("detail.backToList")}</Link>
      <div className="topbar">
        <div className="stack-sm">
          <h1>{p.display_name} <span className="mono muted" style={{ fontSize: "1rem" }}>{p.id}</span></h1>
          <div className="row">
            <RiskBadge risk={p.risk} />
            <Badge variant={p.monitoring_status === "active" ? "ok" : ""}>{t(`status.monitoring.${p.monitoring_status}`)}</Badge>
            <Badge variant={p.review_status === "pending_review" ? "warn" : p.review_status === "reviewed" ? "ok" : p.review_status === "follow_up" ? "info" : ""}>{t(`status.review.${p.review_status}`)}</Badge>
          </div>
        </div>
        <div className="stack-sm" style={{ alignItems: "flex-end" }}>
          <ConnectionIndicator state={detail.connection} lastUpdate={detail.lastSuccess} />
          <button className="btn" onClick={() => setEditing(true)}>{t("common.edit")}</button>
        </div>
      </div>
      <div className="notice" role="note">{t("notice.demo")} · {t("notice.simulated")}</div>
      {detail.error && <div className="notice danger" role="alert">{t("status.connection.failed")}</div>}

      <nav className="tabs" role="tablist" aria-label={t("common.details")}>
        {TABS.map((k) => (
          <button
            key={k} type="button" role="tab" id={`ptab-${k}`} aria-controls={`ppanel-${k}`}
            aria-selected={tab === k} tabIndex={tab === k ? 0 : -1} onClick={() => setTab(k)}
          >{t(`detail.tabs.${k}`)}</button>
        ))}
      </nav>
      <div key={tab} role="tabpanel" id={`ppanel-${tab}`} aria-labelledby={`ptab-${tab}`} tabIndex={0}>
        {panels[tab]}
      </div>

      {editing && <PatientFormDialog patient={p} onClose={() => setEditing(false)} onSubmit={update} busy={save.busy} error={save.error} />}
      {bioDetail && (
        <BiomarkerDetailDialog
          patientId={p.id} cfg={bioDetail} devices={p.devices}
          latest={p.latest_biomarkers[bioDetail.id]} deviceHistory={devHist.data}
          onClose={() => setBioDetail(null)}
        />
      )}
    </>
  );
}
