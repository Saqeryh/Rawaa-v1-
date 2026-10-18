// DoctorApp - Main app shell with sidebar navigation
// ThemeToggle integrated into sidebar next to LanguageSwitcher
// Routes all rendered below

import { NavLink, Route, Routes, useLocation } from "react-router-dom";
import { useSession } from "../../auth/session";
import { useI18n } from "../../i18n";
import { Brand, DemoBanner, LanguageSwitcher, ThemeToggle } from "../../components/shared";
import Overview from "./Overview";
import Patients from "./Patients";
import PatientDetailPage from "./PatientDetail";
import AlertsPage from "./AlertsPage";
import RecordsPage from "./RecordsPage";
import SimulationPage from "./SimulationPage";

export default function DoctorApp() {
  const { t } = useI18n();
  const { signOut } = useSession();
  const location = useLocation();
  const links: [string, string, boolean][] = [["/doctor", "nav.overview", true], ["/doctor/patients", "nav.patients", false], ["/doctor/records", "nav.records", false], ["/doctor/alerts", "nav.alerts", false], ["/doctor/simulation", "nav.simulation", false]];
  return (
    <>
      <a className="skip-link" href="#main">{t("nav.skip")}</a>
      <DemoBanner />
      <div className="shell">
        <aside className="sidebar">
          <Brand />
          <nav className="nav" aria-label={t("nav.doctorArea")}> 
            {links.map(([to, key, end]) => <NavLink key={to} to={to} end={end}>{t(key)}</NavLink>)}
          </nav>
          <div className="stack-sm" style={{ marginTop: "auto" }}>
            <LanguageSwitcher />
            <ThemeToggle />
            <button className="btn sm" onClick={signOut}>{t("common.signOut")}</button>
          </div>
        </aside>
        <main className="main" id="main">
          <Routes>
            <Route index element={<Overview />} />
            <Route path="patients" element={<Patients />} />
            <Route path="patients/:id" element={<PatientDetailPage />} />
            <Route path="records" element={<RecordsPage />} />
            <Route path="alerts" element={<AlertsPage />} />
            <Route path="simulation" element={<SimulationPage />} />
          </Routes>
        </main>
      </div>
    </>
  );
}
