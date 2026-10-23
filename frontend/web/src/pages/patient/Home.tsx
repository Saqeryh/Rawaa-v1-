import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api/endpoints";
import { useSession } from "../../auth/session";
import { useI18n } from "../../i18n";
import { useApi } from "../../hooks/useApi";
import { useAction } from "../../hooks/useAction";
import { AlertList } from "../../components/AlertList";
import { EmergencyPanel, ProposalCard } from "../../components/ProposalCard";
import { ConnectionIndicator, RiskBadge } from "../../components/shared";
import { Badge, Card, ErrorState } from "../../components/ui";
import { usePatient } from "./context";

/* ---- inline SVG icon primitives (project has no icon library) ---- */
/** Wearable smart patch: rounded body + centre sensor dot. */
function PatchIcon() {
  return (
    <svg viewBox="0 0 24 24" width={18} height={18} fill="none" stroke="currentColor"
      strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="4" y="5" width="16" height="14" rx="4" />
      <circle cx="12" cy="12" r="2.4" />
    </svg>
  );
}
/** Live telemetry pulse. */
function PulseIcon() {
  return (
    <svg viewBox="0 0 24 24" width={18} height={18} fill="none" stroke="currentColor"
      strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2 12h4l2.5-6 4 12 2.5-6H22" />
    </svg>
  );
}
/** Risk shield. */
function ShieldIcon() {
  return (
    <svg viewBox="0 0 24 24" width={18} height={18} fill="none" stroke="currentColor"
      strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3l7 3v5c0 4.6-3 8.4-7 10-4-1.6-7-5.4-7-10V6l7-3Z" />
      <path d="M12 9v4" /><path d="M12 16h.01" />
    </svg>
  );
}
/** Heartbeat line for the biomarkers quick action. */
function ActivityIcon() {
  return (
    <svg viewBox="0 0 24 24" width={20} height={20} fill="none" stroke="currentColor"
      strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 12h3.5l2-4.5 3.5 9 2.5-4.5H21" />
    </svg>
  );
}

const cardTitle = (icon: ReactNode, text: string) => (
  <span className="row" style={{ gap: 8 }}>{icon}{text}</span>
);

/**
 * Patient Home — deliberately minimal and mobile-first.
 * Three calm status cards (wearable device, monitoring, AI risk level) built
 * from the live API records, one prominent route into the full biomarker
 * monitor, and the support surfaces (notifications, simulated proposals,
 * emergency help). All detailed biomarker metrics, charts and tables live on
 * /patient/biomarkers.
 */
export default function Home() {
  const { t, fmt } = useI18n();
  const { session } = useSession();
  const tok = session?.token ?? null;
  const { patient: p, alerts, connection, lastSuccess, refresh } = usePatient();
  const proposals = useApi(() => api.proposals(tok, p.id), [tok, p.id, p.risk?.id], { pollMs: 5000 });
  const resolve = useAction();

  const allConnected = p.devices.length > 0 && p.devices.every((d) => d.status === "connected");

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

      {/* ── The three-card core: wearable device, monitoring, AI risk level ── */}
      <div className="grid home-core">
        {/* 1 · Wearable device status */}
        <Card title={cardTitle(<PatchIcon />, t("patientApp.deviceStatus"))}>
          <div className="stack-sm">
            {p.devices.length === 0 ? (
              <p className="muted small">{t("bio.noData")}</p>
            ) : p.devices.map((d) => (
              <div key={d.id} className="row-between" style={{ alignItems: "flex-start" }}>
                <span className="small">
                  <strong>{t("device.kind." + d.kind)}</strong>
                  <span className="xs muted" style={{ display: "block" }}>{d.name}</span>
                </span>
                <Badge variant={d.status === "connected" ? "ok" : "danger"}>{t("status.device." + d.status)}</Badge>
              </div>
            ))}
            {p.devices.length > 0 && (
              <p className="small">{allConnected ? t("patientApp.receivingData") : t("patientApp.checkDevice")}</p>
            )}
            {p.devices.some((d) => d.status !== "connected") && (
              <div className="notice danger xs" role="alert">{t("alert.device_disconnected")}</div>
            )}
            <dl style={{ margin: 0 }}>
              {row(t("device.lastSync"), p.last_update ? `${fmt.dateTime(p.last_update)} (${fmt.relative(p.last_update)})` : t("common.never"))}
            </dl>
          </div>
        </Card>

        {/* 2 · Monitoring status */}
        <Card title={cardTitle(<PulseIcon />, t("patientApp.monitoringStatus"))}>
          <div className="stack-sm">
            <div><Badge variant={p.monitoring_status === "active" ? "ok" : ""}>{t("status.monitoring." + p.monitoring_status)}</Badge></div>
            <dl style={{ margin: 0 }}>
              {row(t("common.lastUpdate"), p.last_update ? `${fmt.dateTime(p.last_update)} (${fmt.relative(p.last_update)})` : t("common.never"))}
            </dl>
            <ConnectionIndicator state={connection} lastUpdate={lastSuccess} />
            <p className="xs muted">{t("notice.simulated")}</p>
            <p className="xs muted">{t("notice.demo")}</p>
          </div>
        </Card>

        {/* 3 · AI risk level (demo classification, never a diagnosis) */}
        <Card title={cardTitle(<ShieldIcon />, t("patientApp.riskMonitoring"))}>
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

      {/* ── Biomarkers monitor — the dedicated route for all detailed readings ── */}
      <Link className="btn primary grow home-cta" to="/patient/biomarkers" data-testid="home-biomarkers-cta">
        <ActivityIcon />
        <span>{t("patientApp.openBiomarkers")}</span>
      </Link>

      {/* ── Quick access (TAPs and Settings also live in the bottom dock) ── */}
      <section className="stack-sm" aria-labelledby="home-qa-h">
        <h2 id="home-qa-h">{t("patientApp.quickActions")}</h2>
        <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 140px), 1fr))" }}>
          <Link className="btn grow" to="/patient/vitals">{t("patientApp.openVitals")}</Link>
          <Link className="btn grow" to="/patient/assistant">{t("nav.taps")}</Link>
          <Link className="btn grow" to="/patient/settings">{t("nav.settings")}</Link>
        </div>
      </section>

      {/* ── Notifications ── */}
      <Card title={t("patientApp.notifications")} actions={<Link className="btn sm" to="/patient/notifications">{t("patientApp.seeAll")}</Link>}>
        {alerts.length === 0 ? <p className="muted">{t("patientApp.noNotifications")}</p> : <AlertList alerts={alerts} />}
      </Card>

      {(proposals.data ?? []).some((x) => x.status === "pending") && <div className="notice info xs">{t("patientApp.proposalHint")}</div>}
      <ProposalCard proposals={proposals.data ?? []} onResolve={async (pr, action) => { await resolve.run(() => action === "confirm" ? api.confirmProposal(tok, pr.id) : api.cancelProposal(tok, pr.id)); proposals.refresh(); refresh(); }} />
      {resolve.error ? <ErrorState error={resolve.error} /> : null}
      <EmergencyPanel />
      <p className="xs muted" style={{ textAlign: "center" }}>{t("patientApp.ownDataOnly")} · {t("notice.demo")}</p>
    </>
  );
}
