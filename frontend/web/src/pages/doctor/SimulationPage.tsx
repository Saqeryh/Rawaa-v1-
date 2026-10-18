import { useState } from "react";
import { api } from "../../api/endpoints";
import { useSession } from "../../auth/session";
import { useI18n } from "../../i18n";
import { useApi } from "../../hooks/useApi";
import { useAction } from "../../hooks/useAction";
import { SimPatientTools } from "../../components/SimTools";
import { ConnectionIndicator } from "../../components/shared";
import { Badge, Card, ConfirmDialog, EmptyState, ErrorState, LoadingBlock } from "../../components/ui";

export default function SimulationPage() {
  const { t, fmt } = useI18n();
  const { session } = useSession();
  const tok = session?.token ?? null;
  const state = useApi(() => api.sim.state(tok), [tok], { pollMs: 2000 });
  const events = useApi(() => api.sim.events(tok), [tok], { pollMs: 3000 });
  const patients = useApi(() => api.patients(tok), [tok]);
  const { run, busy, error } = useAction();
  const [patientId, setPatientId] = useState("");
  const [confirmReset, setConfirmReset] = useState(false);
  const s = state.data;
  const act = async (a: "start" | "pause" | "resume" | "reset" | "tick") => { await run(() => api.sim.action(tok, a)); state.refresh(); events.refresh(); patients.refresh(); };
  const badge = s?.status === "running" ? "ok" : s?.status === "paused" ? "warn" : "";

  return (
    <>
      <div className="topbar"><h1>{t("sim.title")}</h1><ConnectionIndicator state={state.connection} lastUpdate={state.lastSuccess} /></div>
      <div className="notice info">{t("sim.banner")} {t("notice.simulated")}</div>
      {state.loading && !s && <LoadingBlock rows={3} />}
      {state.error && !s && <ErrorState error={state.error} onRetry={state.reload} />}
      {s && (
        <Card title={<>{t("sim.title")} <Badge variant={badge}>{t(`sim.state.${s.status}`)}</Badge></>}>
          <div className="stack">
            <div className="row">
              <button className="btn primary" disabled={busy || s.status !== "stopped"} onClick={() => act("start")}>{t("sim.start")}</button>
              <button className="btn" disabled={busy || s.status !== "running"} onClick={() => act("pause")}>{t("sim.pause")}</button>
              <button className="btn" disabled={busy || s.status !== "paused"} onClick={() => act("resume")}>{t("sim.resume")}</button>
              <button className="btn" disabled={busy} onClick={() => act("tick")}>{t("sim.tick")}</button>
              <button className="btn danger" disabled={busy} onClick={() => setConfirmReset(true)}>{t("sim.reset")}</button>
            </div>
            <dl className="small muted" style={{ margin: 0, display: "flex", gap: 24, flexWrap: "wrap" }}>
              <div><dt style={{ display: "inline" }}>{t("sim.tickCount")}: </dt><dd style={{ display: "inline", margin: 0 }} className="num">{fmt.number(s.tick_count, 0)}</dd></div>
              <div><dt style={{ display: "inline" }}>{t("sim.interval")}: </dt><dd style={{ display: "inline", margin: 0 }} className="num">{t("sim.seconds", { n: fmt.number(s.interval_seconds) })}</dd></div>
              <div><dt style={{ display: "inline" }}>{t("sim.lastTick")}: </dt><dd style={{ display: "inline", margin: 0 }} className="num">{s.last_tick_at ? fmt.dateTime(s.last_tick_at) : t("common.never")}</dd></div>
            </dl>
            {error ? <ErrorState error={error} /> : null}
          </div>
        </Card>
      )}

      <Card title={t("sim.patient")}>
        <div className="stack">
          <div className="field" style={{ maxWidth: 360 }}>
            <label htmlFor="sim-patient">{t("sim.patient")}</label>
            <select id="sim-patient" className="select" value={patientId} onChange={(e) => setPatientId(e.target.value)}>
              <option value="">—</option>
              {(patients.data ?? []).map((p) => <option key={p.id} value={p.id}>{p.display_name} ({p.id})</option>)}
            </select>
          </div>
          {patientId && <SimPatientTools key={patientId} patientId={patientId} onDone={() => { events.refresh(); patients.refresh(); }} />}
        </div>
      </Card>

      <Card title={t("sim.events")}>
        {events.loading && !events.data ? <LoadingBlock rows={3} /> : (events.data ?? []).length === 0 ? <EmptyState>{t("sim.noEvents")}</EmptyState> : (
          <ul className="timeline">
            {events.data!.map((e) => (
              <li key={e.id}><div>
                <div>{t(`sim.eventKind.${e.kind}`)} {e.patient_id && <span className="mono xs muted">{e.patient_id}</span>}</div>
                <div className="xs muted num">{fmt.dateTime(e.ts)}{e.detail ? <> · <span className="mono">{e.detail}</span></> : null}</div>
              </div></li>
            ))}
          </ul>
        )}
      </Card>
      {confirmReset && <ConfirmDialog danger title={t("sim.resetConfirmTitle")} text={t("sim.resetConfirmText")} confirmLabel={t("sim.reset")} busy={busy}
        onClose={() => setConfirmReset(false)} onConfirm={async () => { await act("reset"); setConfirmReset(false); }} />}
    </>
  );
}
