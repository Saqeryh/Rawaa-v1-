// DoctorApp — shared doctor shell: unified header (brand, pill navigation, theme toggle,
// real notifications entry point, settings, account) + all doctor routes below it.
// Every doctor page renders inside the same .dashboard-canvas board, matching the
// reference design; page content stays page-specific.

import { NavLink, Route, Routes } from "react-router-dom";
import { api } from "../../api/endpoints";
import { useSession } from "../../auth/session";
import { useI18n } from "../../i18n";
import { useApi } from "../../hooks/useApi";
import { DemoBanner } from "../../components/shared";
import { ThemeToggle } from "../../components/ui";
import "../../styles/doctor-dashboard.css";
import Overview from "./Overview";
import Patients from "./Patients";
import PatientDetailPage from "./PatientDetail";
import AlertsPage from "./AlertsPage";
import RecordsPage from "./RecordsPage";
import SimulationPage from "./SimulationPage";
import SettingsPage from "./SettingsPage";

const NAV_LINKS: [string, string, boolean][] = [
  ["/doctor", "nav.overview", true],
  ["/doctor/patients", "nav.patients", false],
  ["/doctor/records", "nav.records", false],
  ["/doctor/alerts", "nav.alerts", false],
  ["/doctor/simulation", "nav.simulation", false],
  ["/doctor/settings", "nav.settings", false],
];

function DoctorHeader() {
  const { t } = useI18n();
  const { session, signOut } = useSession();
  const tok = session?.token ?? null;
  // Real unread count from the backend (open alerts), refreshed periodically.
  const alerts = useApi(() => api.alerts(tok, { status: "open" }), [tok], { pollMs: 30000 });
  const openCount = alerts.data?.length ?? 0;

  return (
    <header className="doc-header">
      <NavLink to="/doctor" end className="brand-zone" aria-label={t("nav.overview")}>
        {/* actual project logo instead of the placeholder heartbeat badge */}
        <img
          src="/rawaa.png"
          alt="شعار رَواء"
          className="brand-logo h-8 md:h-9 w-auto object-contain rounded-lg"
          onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
        />
        <span className="brand-text">
          <span className="brand-title">{t("app.arabicName")} · ThrombiX</span>
          <span className="brand-subtitle">{t("app.tagline")}</span>
        </span>
      </NavLink>

      <nav className="nav-pill-group" aria-label={t("nav.doctorArea")}>
        {NAV_LINKS.map(([to, key, end]) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) => `nav-pill-btn${isActive ? " active" : ""}`}
          >{t(key)}</NavLink>
        ))}
      </nav>

      <div className="nav-actions">
        <ThemeToggle variant="icon" />
        <NavLink to="/doctor/alerts" className="icon-circle-btn notif-btn" title={t("alert.title")} aria-label={`${t("alert.title")}${openCount > 0 ? `: ${openCount}` : ""}`}>
          <i className="ti ti-bell" aria-hidden="true"></i>
          {openCount > 0 && <span className="notif-badge num" aria-hidden="true">{openCount > 9 ? "9+" : openCount}</span>}
        </NavLink>
        <button className="icon-circle-btn" onClick={signOut} title={t("common.signOut")} aria-label={t("common.signOut")}>
          <i className="ti ti-logout" aria-hidden="true"></i>
        </button>
      </div>
    </header>
  );
}

export default function DoctorApp() {
  const { t } = useI18n();
  return (
    <>
      <a className="skip-link" href="#main">{t("nav.skip")}</a>
      <DemoBanner />
      <div className="dashboard-canvas">
        <DoctorHeader />
        <main className="doc-main" id="main">
          <Routes>
            <Route index element={<Overview />} />
            <Route path="patients" element={<Patients />} />
            <Route path="patients/:id" element={<PatientDetailPage />} />
            <Route path="records" element={<RecordsPage />} />
            <Route path="alerts" element={<AlertsPage />} />
            <Route path="simulation" element={<SimulationPage />} />
            <Route path="settings" element={<SettingsPage />} />
          </Routes>
        </main>
      </div>
    </>
  );
}
