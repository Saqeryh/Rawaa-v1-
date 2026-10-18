import { Link } from "react-router-dom";
import { api } from "../../api/endpoints";
import type { Note, PatientSummary } from "../../api/types";
import { useSession } from "../../auth/session";
import { useI18n } from "../../i18n";
import { useApi } from "../../hooks/useApi";
import { Badge, Card, EmptyState, ErrorState, LoadingBlock } from "../../components/ui";
import { ConnectionIndicator } from "../../components/shared";

type RecordRow = Note & { patient_name: string };

/**
 * Medical records = the clinical notes stored by the existing backend (one notes endpoint per patient,
 * collected here for the patients returned by GET /patients). Appointments have NO table or endpoint in the
 * current backend, so that section deliberately shows an explicit "not available" message instead of fake rows.
 */
export default function RecordsPage() {
  const { t, fmt } = useI18n();
  const { session } = useSession();
  const tok = session?.token ?? null;

  const list = useApi(() => api.patients(tok, { sort: "last_update", order: "desc" }), [tok], { pollMs: 30000 });
  const idsKey = (list.data ?? []).map((p) => p.id).join("|");

  const records = useApi(async () => {
    const ps: PatientSummary[] = list.data ?? [];
    const res = await Promise.allSettled(ps.slice(0, 20).map((p) => api.notes(tok, p.id)));
    const rows: RecordRow[] = [];
    ps.forEach((p, i) => {
      const r = res[i];
      if (r.status === "fulfilled") r.value.data.forEach((n) => rows.push({ ...n, patient_name: p.display_name }));
    });
    rows.sort((a, b) => fmt.toMs(b.created_at) - fmt.toMs(a.created_at));
    return { data: rows, error: null, meta: null };
  }, [tok, idsKey], { enabled: !!list.data, pollMs: 30000 });

  return (
    <>
      <div className="topbar">
        <h1>{t("nav.records")}</h1>
        <ConnectionIndicator state={records.connection} lastUpdate={records.lastSuccess} />
      </div>
      <div className="notice xs" role="note">{t("records.notice")} · {t("notice.demo")}</div>

      <Card title={t("records.title")} actions={records.data ? <span className="xs muted">{t("records.count", { n: fmt.number(records.data.length, 0) })}</span> : null}>
        {list.loading && !list.data && <LoadingBlock rows={4} />}
        {list.error && !list.data && <ErrorState error={list.error} onRetry={list.reload} />}
        {list.data && records.loading && !records.data && <LoadingBlock rows={4} />}
        {records.data && records.data.length === 0 && <EmptyState>{t("records.empty")}</EmptyState>}
        {records.data && records.data.length > 0 && (
          <div className="table-wrap">
            <table>
              <thead><tr>
                <th>{t("records.patient")}</th><th>{t("records.date")}</th><th>{t("records.type")}</th>
                <th>{t("records.status")}</th><th>{t("records.doctor")}</th><th>{t("records.notes")}</th>
              </tr></thead>
              <tbody>
                {records.data.map((n) => (
                  <tr key={`${n.patient_id}-${n.id}`}>
                    <td><Link to={`/doctor/patients/${n.patient_id}`}>{n.patient_name}</Link> <span className="mono xs muted">{n.patient_id}</span></td>
                    <td className="xs num">{fmt.dateTime(n.created_at)}</td>
                    <td><Badge variant="primary">{t("records.typeNote")}</Badge></td>
                    <td>
                      {n.review_status
                        ? <Badge variant={n.review_status === "reviewed" ? "ok" : n.review_status === "follow_up" ? "info" : "warn"}>{t(`status.review.${n.review_status}`)}</Badge>
                        : <span className="xs muted">{t("status.review.none")}</span>}
                    </td>
                    <td className="mono xs">{n.author_id}</td>
                    <td className="small">{n.body}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title={t("appointments.title")}>
        <div className="table-wrap">
          <table>
            <thead><tr>
              <th>{t("appointments.patient")}</th><th>{t("appointments.date")}</th><th>{t("appointments.time")}</th>
              <th>{t("appointments.department")}</th><th>{t("appointments.status")}</th>
            </tr></thead>
            <tbody>
              <tr><td colSpan={5}><EmptyState>{t("appointments.empty")}</EmptyState></td></tr>
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
