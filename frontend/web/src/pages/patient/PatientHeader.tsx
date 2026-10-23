import { useContext, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useI18n } from "../../i18n";
import { PatientContext } from "./context";

/* ---- inline SVG icon primitives (project has no icon library) ---- */
function NotifIcon() {
  return (
    <svg viewBox="0 0 24 24" width={20} height={20} fill="none" stroke="currentColor"
      strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M18 15.5V11a6 6 0 1 0-12 0v4.5L4.5 18h15L18 15.5Z" />
      <path d="M9.5 18a2.5 2.5 0 0 0 5 0" />
    </svg>
  );
}
/** Modern support headset (Lucide-style headphones): headband arc + two earcups. */
function HeadsetIcon() {
  return (
    <svg viewBox="0 0 24 24" width={20} height={20} fill="none" stroke="currentColor"
      strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 15v-3a9 9 0 0 1 18 0v3" />
      <path d="M21 16a2 2 0 0 1-2 2h-1a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1h3zM3 16a2 2 0 0 0 2 2h1a1 1 0 0 0 1-1v-3a1 1 0 0 0-1-1H3z" />
    </svg>
  );
}
function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" width={18} height={18} fill="none" stroke="currentColor"
      strokeWidth={2} strokeLinecap="round" aria-hidden="true">
      <circle cx={11} cy={11} r="7" />
      <path d="M20 20l-3-3" />
    </svg>
  );
}

/**
 * Patient header — the purple vertical header with the project's gradient and
 * an organic wavy bottom curve. PatientApp renders it inside
 * PatientContext (loaded record) and just below it while the first request is
 * still in flight, so the context is read optionally: with a record it shows
 * the signed-in patient's own name, without one it shows the generic
 * greeting. The top strip is deliberately minimal: the RAWA mark, the
 * notifications route and support. Navigation lives in the bottom dock.
 */
type HeaderProps = {
  badge?: ReactNode;
  footer?: ReactNode;
};

export default function PatientHeader({
  badge,
  footer,
}: HeaderProps) {
  const { t } = useI18n();
  const ctx = useContext(PatientContext);
  const [open, setOpen] = useState(false);
  const patientName = ctx?.patient.display_name?.trim() || null;
  const alertCount = ctx?.alerts.filter((a) => a.status === "open").length ?? 0;

  return (
    <header
      className="patient-header"
      style={{
        background: "linear-gradient(155deg, #24133f 0%, #35205f 52%, #6041a5 100%)",
      }}
      aria-label={t("nav.patientArea")}
      data-testid="patient-header"
    >
      <div className="ph-content">
        {/* Top control strip: notifications / support */}
        <div className="ph-topbar">
          <div className="ph-actions">
            <Link
              className="ph-icon-button"
              to="/patient/notifications"
              aria-label={t("patientApp.notifications")}
              data-testid="patient-header-notif"
            >
              <NotifIcon />
              {alertCount > 0 && (
                <span className="ph-badge" aria-hidden="true" data-testid="patient-header-notif-badge">
                  {alertCount}
                </span>
              )}
            </Link>
            <button
              className="ph-icon-button"
              type="button"
              aria-label={t("patientApp.support")}
            >
              <HeadsetIcon />
            </button>
          </div>
          {badge}
        </div>

        {/* RAWA mark — the heart+droplet cropped from the project's own artwork,
            rendered transparent: no text title, no background block. */}
        <Link
          className="ph-brand"
          to="/patient"
          aria-label={t("nav.home")}
          data-testid="patient-header-brand"
        >
          <svg className="ph-logo" viewBox="32 15 105 120" width={38} height={44} focusable="false" aria-hidden="true">
            <image href="/rawaa.png" x="0" y="0" width="280" height="145" preserveAspectRatio="xMinYMid meet" />
          </svg>
        </Link>

        {/* Welcome area — live patient name from PatientDetail */}
        <div className="ph-welcome" data-testid="patient-header-welcome">
          <h1 className="ph-patient-name" data-testid="patient-header-hello">
            {t("patientApp.hello", { name: patientName ?? t("patientApp.anonymous") })}
          </h1>
          <p className="ph-subtitle" data-testid="patient-header-summary">
            {t("patientApp.welcomeSummary")}
          </p>
        </div>

        {/* Visual-only search field (the backend has no search endpoint) */}
        <div className="ph-search" role="search" aria-label={t("patientApp.searchPlaceholder")}>
          <SearchIcon />
          <input
            className="ph-search-input"
            type="search"
            placeholder={t("patientApp.searchPlaceholder")}
            aria-label={t("patientApp.searchPlaceholder")}
            aria-controls="patient-search-results"
            aria-expanded={open}
            aria-autocomplete="list"
            autoComplete="off"
            aria-activedescendant={open ? "patient-search-result-0" : undefined}
            onFocus={() => setOpen(true)}
            onBlur={(e) => {
              setTimeout(() => {
                if (!e.relatedTarget || e.relatedTarget instanceof HTMLElement && !e.relatedTarget.closest?.(".ph-search")) setOpen(false);
              }, 120);
            }}
            onChange={(e) => {
              if (!e.target.value.trim()) setOpen(false);
            }}
          />
          <div
            className="ph-search-results"
            id="patient-search-results"
            role="listbox"
            aria-label={t("patientApp.searchResults")}
            hidden={!open}
          >
            <div className="ph-search-result" role="option" id="patient-search-result-0">
              <strong>{t("patientApp.searchPlaceholder")}</strong>
              <span className="xs muted">{t("patientApp.searchPlaceholder")}</span>
            </div>
            <div className="ph-search-result" role="option">
              <strong>RAWA · ThrombiX</strong>
              <span className="xs muted">Research prototype · synthetic data only</span>
            </div>
            <div className="ph-search-result" role="option">
              <strong>RAWA · ThrombiX</strong>
              <span className="xs muted">Research prototype · synthetic data only</span>
            </div>
            <div className="ph-search-result" role="option">
              <strong>RAWA · ThrombiX</strong>
              <span className="xs muted">Research prototype · synthetic data only</span>
            </div>
            <div className="ph-search-result" role="option">
              <strong>RAWA · ThrombiX</strong>
              <span className="xs muted">Research prototype · synthetic data only</span>
            </div>
          </div>
        </div>
      </div>

      {footer}

      {/* Organic wave: the page background is painted below the curve, so the
          header ends in a soft two-lobed wave instead of a hard horizontal edge. */}
      <svg className="ph-wave" viewBox="0 0 600 40" preserveAspectRatio="none" aria-hidden="true">
        <path d="M0 40 L0 6 C110 34 215 0 320 16 C430 32 520 4 600 24 L600 40 Z" fill="var(--bg)" />
      </svg>
    </header>
  );
}
