import { useEffect, useMemo, useRef } from "react";
import { Link, Route, Routes, useLocation } from "react-router-dom";
import { api } from "../../api/endpoints";
import { useSession } from "../../auth/session";
import { useI18n } from "../../i18n";
import { useApi } from "../../hooks/useApi";
import { DemoBanner } from "../../components/shared";
import { ErrorState, LoadingBlock } from "../../components/ui";
import { PatientContext, type PatientCtx } from "./context";
import Home from "./Home";
import BiomarkersPage from "./BiomarkersPage";
import VitalsPage from "./VitalsPage";
import Assistant from "./Assistant";
import SettingsPage from "./SettingsPage";
import PatientHeader from "./PatientHeader";
import PatientDock, { DOCK_STYLE } from "./PatientDock";

/** Mobile-first shell. Every request uses the signed-in patient's own id + token; the backend enforces it. */
export default function PatientApp() {
  const { t, fmt } = useI18n();
  const { session } = useSession();
  const tok = session?.token ?? null;
  const pid = session?.patientId ?? "";
  const detail = useApi(() => api.patient(tok, pid), [tok, pid], { pollMs: 5000 });
  const alerts = useApi(() => api.alerts(tok, {}), [tok, pid], { pollMs: 5000 });
  // The purple header belongs to the Home screen: the readings, assistant and
  // settings screens keep their own titles and layout exactly as before.
  const { pathname } = useLocation();
  const atHome = pathname === "/patient" || pathname === "/patient/";

  // One context value for the whole phone. While the first request is in flight the
  // value is null, so the header shows its generic greeting and no page is mounted;
  // once the record arrives every page and the header read the same live data.
  // Keeping the provider in one fixed position means the header and the dock are
  // never unmounted/remounted when the data arrives.
  const value = useMemo<PatientCtx | null>(
    () =>
      detail.data
        ? {
            patient: detail.data,
            alerts: alerts.data ?? [],
            connection: detail.connection,
            lastSuccess: detail.lastSuccess,
            refresh: () => {
              detail.refresh();
              alerts.refresh();
            },
          }
        : null,
    [detail.data, detail.connection, detail.lastSuccess, alerts.data],
  );

  /** Decorative device-mock clock: written straight into the node so it never re-renders the app. */
  const clock = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const tick = () => { if (clock.current) clock.current.textContent = fmt.time(Date.now()); };
    tick();
    const id = setInterval(tick, 20_000);
    return () => clearInterval(id);
  }, [fmt]);

  return (
    <>
      <a className="skip-link" href="#main">{t("nav.skip")}</a>
      <DemoBanner />
      {/* Smartphone device mockup: the frame is built with HTML/CSS only (no images), so it stays responsive. */}
      <div className="device-stage">
        <div className="device">
          <div className="device-screen">
            <div className="device-status" aria-hidden="true">
              <span className="device-time num" ref={clock} />
              <div className="device-indicators">
                <span className="device-bars"><i /><i /><i /><i /></span>
                <svg className="device-wifi" width="15" height="12" viewBox="0 0 16 12" fill="none" focusable="false">
                  <path d="M1.7 4.3a9.4 9.4 0 0 1 12.6 0" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
                  <path d="M4.3 7a5.7 5.7 0 0 1 7.4 0" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
                  <circle cx="8" cy="9.7" r="1.3" fill="currentColor" />
                </svg>
                <span className="device-battery"><i /></span>
              </div>
            </div>
            <span className="device-island" aria-hidden="true" />
            <div className="phone" style={DOCK_STYLE}>
              <PatientContext.Provider value={value}>
                <main className="phone-body" id="main">
                  {/* The purple header is part of the Home page, so it scrolls away with
                      the content instead of eating half the phone screen forever. */}
                  {atHome && (
                    <PatientHeader
                      actions={
                        <div className="row" style={{ gap: 8 }}>
                          <Link className="btn sm" to="/patient/settings">{t("nav.settings")}</Link>
                          <Link className="btn sm" to="/patient/assistant">{t("nav.taps")}</Link>
                        </div>
                      }
                    />
                  )}
                  {!detail.data && detail.loading && (
                    <div className="stack" style={{ alignItems: "center", textAlign: "center", padding: "var(--s6) 0" }} role="status" aria-live="polite">
                      <img
                        src="/logo.png" alt="" width={96} height={48}
                        style={{ width: 96, height: "auto", background: "#fff", borderRadius: 14, padding: "6px 12px", boxShadow: "var(--shadow)" }}
                        onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                      />
                      <p className="muted">{t("patientApp.loading")}</p>
                      <LoadingBlock rows={4} />
                    </div>
                  )}
                  {!detail.data && detail.error && <ErrorState error={detail.error} onRetry={detail.reload} />}
                  {detail.data && (
                    <Routes>
                      <Route index element={<Home />} />
                      <Route path="biomarkers" element={<BiomarkersPage />} />
                      <Route path="vitals" element={<VitalsPage />} />
                      <Route path="assistant" element={<Assistant />} />
                      <Route path="settings" element={<SettingsPage />} />
                    </Routes>
                  )}
                </main>
                <PatientDock />
              </PatientContext.Provider>
            </div>
            <span className="device-home" aria-hidden="true" />
          </div>
        </div>
      </div>
    </>
  );
}
