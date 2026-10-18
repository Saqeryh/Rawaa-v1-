import { useContext, useState, type ReactNode } from "react";
import { useI18n } from "../../i18n";
import { Brand } from "../../components/shared";
import { PatientContext } from "./context";

/* ---- inline SVG icon primitives (project has no icon library) ---- */
function MenuIcon() {
  return (
    <svg viewBox="0 0 24 24" width={20} height={20} fill="none" stroke="currentColor"
      strokeWidth={2} strokeLinecap="round" aria-hidden="true">
      <line x1="4" y1="7" x2="20" y2="7" />
      <line x1="4" y1="12" x2="20" y2="12" />
      <line x1="4" y1="17" x2="20" y2="17" />
    </svg>
  );
}
function NotifIcon() {
  return (
    <svg viewBox="0 0 24 24" width={20} height={20} fill="none" stroke="currentColor"
      strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M18 15.5V11a6 6 0 1 0-12 0v4.5L4.5 18h15L18 15.5Z" />
      <path d="M9.5 18a2.5 2.5 0 0 0 5 0" />
    </svg>
  );
}
function HelpIcon() {
  return (
    <svg viewBox="0 0 24 24" width={20} height={20} fill="none" stroke="currentColor"
      strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx={12} cy={12} r={9} />
      <path d="M9.6 9.4a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1.1.9-1.1 1.7" />
      <path d="M12 17h.01" />
    </svg>
  );
}
function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" width={18} height={18} fill="none" stroke="currentColor"
      strokeWidth={2} strokeLinecap="round" aria-hidden="true">
      <circle cx={11} cy={11} r={7} />
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
 * greeting. Props add a small top-control strip and a footer without touching
 * the header's own layout.
 */
type HeaderProps = {
  badge?: ReactNode;
  actions?: ReactNode;
  footer?: ReactNode;
};

export default function PatientHeader({
  badge,
  actions,
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
        {/* Top control strip: menu / notifications / support */}
        <div className="ph-topbar">
          {actions}
          <div className="ph-actions">
            <button
              className="ph-icon-button"
              type="button"
              aria-label={t("patientApp.menu")}
              onClick={undefined}
            >
              <MenuIcon />
            </button>
            <button
              className="ph-icon-button"
              type="button"
              aria-label={t("patientApp.notifications")}
              aria-expanded={open}
              aria-controls="patient-search-results"
              onClick={() => setOpen((v) => !v)}
            >
              <NotifIcon />
              {alertCount > 0 && (
                <span className="ph-badge" aria-hidden="true" data-testid="patient-header-notif-badge">
                  {alertCount}
                </span>
              )}
            </button>
            <button
              className="ph-icon-button"
              type="button"
              aria-label={t("patientApp.support")}
              onClick={undefined}
            >
              <HelpIcon />
            </button>
          </div>
          {badge}
        </div>

        {/* Original RAWA logo in its own area */}
        <div className="ph-brand" data-testid="patient-header-brand">
          <Brand />
        </div>

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
