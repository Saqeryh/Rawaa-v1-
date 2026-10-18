import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../../api/endpoints";
import type { PatientSummary } from "../../api/types";
import { useSession } from "../../auth/session";
import { useI18n } from "../../i18n";
import { useApi } from "../../hooks/useApi";
import { useAction } from "../../hooks/useAction";
import { useConfig } from "../../hooks/useConfig";
import { PatientFormDialog, type PatientFormValues } from "../../components/PatientForm";
import { Badge, Card, EmptyState, ErrorState, LoadingBlock } from "../../components/ui";
import { ConnectionIndicator, RiskBadge } from "../../components/shared";

const RISKS = ["low_risk", "rising_activity", "pre_thrombotic_state", "critical_thrombosis_risk", "insufficient_data"];
const reviewVariant = { none: "", pending_review: "warn", reviewed: "ok", follow_up: "info" } as const;
/** Latest hs-CRP / D-dimer come from each patient's detail record; above this row count the columns stay hidden (no N+1 storm). */
const DETAIL_ROW_CAP = 20;
const BIO_COLUMNS = ["hs_crp", "d_dimer"];

/** One table row; fetches its own detail record so the biomarker columns always show real API values (or "—", never 0). */
function PatientRow({ p, bioIds, enabled }: { p: PatientSummary; bioIds: string[]; enabled: boolean }) {
  const { t, fmt } = useI18n();
  const { session } = useSession();
  const tok = session?.token ?? null;
  const detail = useApi(() => api.patient(tok, p.id), [tok, p.id, p.last_update, enabled], { enabled });

  const bioCell = (bid: string) => {
    const r = detail.data?.latest_biomarkers[bid];
    const missing = !r || r.value == null || r.quality === "missing";
    return (
      <td key={bid} className="num" title={r ? `${fmt.dateTime(r.measured_at)} · ${t(`bio.source.${r.source}`)}` : undefined}>
        {missing ? "—" : fmt.number(r.value)}
      </td>
    );
  };

  return (
    <tr>
      <td className="mono">{p.id}</td>
      <td><Link to={`/doctor/patients/${p.id}`}><strong>{p.display_name}</strong></Link></td>
      <td className="num">{p.age ?? "—"}</td>
      <td><RiskBadge risk={p.risk} /></td>
      {bioIds.map(bioCell)}
      <td><Badge variant={reviewVariant[p.review_status]}>{t(`status.review.${p.review_status}`)}</Badge></td>
      <td><Badge variant={p.monitoring_status === "active" ? "ok" : ""}>{t(`status.monitoring.${p.monitoring_status}`)}</Badge></td>
      <td><Badge variant={p.devices_connected === p.devices_total ? "ok" : "danger"}>{t("patients.devicesShort", { c: fmt.number(p.devices_connected, 0), t: fmt.number(p.devices_total, 0) })}</Badge></td>
      <td className="xs num" title={p.last_update ? fmt.dateTime(p.last_update) : undefined}>{p.last_update ? fmt.relative(p.last_update) : t("common.never")}</td>
      <td><Link className="btn sm" to={`/doctor/patients/${p.id}`}>{t("patients.viewPatient")}</Link></td>
    </tr>
  );
}

export default function Patients() {
  const { t, fmt } = useI18n();
  const { session } = useSession();
  const tok = session?.token ?? null;
  const { config } = useConfig();
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState("");
  const risk = params.get("risk") ?? "";
  const [status, setStatus] = useState("");
  const [sensor, setSensor] = useState("");
  const [sort, setSort] = useState("id");
  const [order, setOrder] = useState("asc");
  const [creating, setCreating] = useState(false);
  const { data, error, loading, reload, connection, lastSuccess } = useApi(
    () => api.patients(tok, { search: search.trim(), risk, monitoring_status: status, sort, order }),
    [tok, search, risk, status, sort, order], { pollMs: 5000 });
  const { busy, error: createError, run } = useAction();

  const create = async (v: PatientFormValues) => {
    const r = await run(() => api.createPatient(tok, v));
    if (r) { setCreating(false); nav(`/doctor/patients/${r.data.id}`); }
  };

  // Latest-reading biomarker columns (from config; only the two requested indicators).
  const bioCols = BIO_COLUMNS.map((id) => config?.biomarkers.find((b) => b.id === id)).filter((b) => !!b);
  const fetchDetails = (data?.length ?? 0) > 0 && (data?.length ?? 0) <= DETAIL_ROW_CAP;

  // Sensor-status filter is applied client-side on top of the server-side filters.
  const rows = (data ?? []).filter((p) =>
    sensor === "connected" ? p.devices_connected === p.devices_total :
    sensor === "disconnected" ? p.devices_connected < p.devices_total : true);

  return (
    <>
      <div className="topbar">
        <h1>{t("patients.title")}</h1>
        <div className="row"><ConnectionIndicator state={connection} lastUpdate={lastSuccess} />
          <button className="btn primary" onClick={() => setCreating(true)}>{t("patients.add")}</button></div>
      </div>
      <Card tight>
        <div className="form-grid">
          <div className="field"><label htmlFor="f-search">{t("common.search")}</label>
            <input id="f-search" className="input" type="search" placeholder={t("patients.search")} value={search} onChange={(e) => setSearch(e.target.value)} /></div>
          <div className="field"><label htmlFor="f-risk">{t("patients.filterRisk")}</label>
            <select id="f-risk" className="select" value={risk} onChange={(e) => { const p = new URLSearchParams(params); if (e.target.value) p.set("risk", e.target.value); else p.delete("risk"); setParams(p); }}>
              <option value="">{t("common.all")}</option>
              {RISKS.map((r) => <option key={r} value={r}>{r === "insufficient_data" ? t("risk.insufficient") : t(`risk.${r}`)}</option>)}
            </select></div>
          <div className="field"><label htmlFor="f-status">{t("patients.filterStatus")}</label>
            <select id="f-status" className="select" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">{t("common.all")}</option>
              {["active", "paused", "discharged"].map((s) => <option key={s} value={s}>{t(`status.monitoring.${s}`)}</option>)}
            </select></div>
          <div className="field"><label htmlFor="f-sensor">{t("patients.filterSensor")}</label>
            <select id="f-sensor" className="select" value={sensor} onChange={(e) => setSensor(e.target.value)}>
              <option value="">{t("common.all")}</option>
              <option value="connected">{t("patients.sensorAll")}</option>
              <option value="disconnected">{t("patients.sensorAnyDown")}</option>
            </select></div>
          <div className="field"><label htmlFor="f-sort">{t("patients.sortBy")}</label>
            <div className="row" style={{ flexWrap: "nowrap" }}>
              <select id="f-sort" className="select" value={sort} onChange={(e) => setSort(e.target.value)}>
                {["id", "name", "risk", "last_update"].map((s) => <option key={s} value={s}>{t(`patients.sort.${s}`)}</option>)}
              </select>
              <select aria-label={t("patients.sortBy")} className="select" value={order} onChange={(e) => setOrder(e.target.value)}>
                <option value="asc">{t("patients.order.asc")}</option><option value="desc">{t("patients.order.desc")}</option>
              </select>
            </div></div>
        </div>
      </Card>

      {loading && !data && <LoadingBlock rows={6} />}
      {error && !data && <ErrorState error={error} onRetry={reload} />}
      {data && (
        <Card title={t("patients.count", { n: fmt.number(rows.length, 0) })}>
          {rows.length === 0 ? <EmptyState>{t("patients.empty")}</EmptyState> : (
            <div className="table-wrap">
              <table>
                <thead><tr>
                  <th>{t("common.id")}</th><th>{t("common.name")}</th><th>{t("common.age")}</th><th>{t("risk.title")}</th>
                  {bioCols.map((b) => <th key={b!.id}>{b!.abbreviation}</th>)}
                  <th>{t("detail.review")}</th><th>{t("patients.filterStatus")}</th><th>{t("device.title")}</th>
                  <th>{t("common.lastUpdate")}</th><th>{t("common.actions")}</th>
                </tr></thead>
                <tbody>
                  {rows.map((p) => (
                    <PatientRow key={p.id} p={p} bioIds={bioCols.map((b) => b!.id)} enabled={fetchDetails} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {bioCols.length > 0 && <p className="xs muted" style={{ marginTop: 10 }}>{t("bio.unitConfigurable")}</p>}
        </Card>
      )}
      {creating && <PatientFormDialog onClose={() => setCreating(false)} onSubmit={create} busy={busy} error={createError} />}
    </>
  );
}
