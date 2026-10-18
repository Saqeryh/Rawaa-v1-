import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { useI18n } from "../../i18n";

/* ------------------------------------------------------------------ *
 * Bottom Navigation Bar / Dock — one dock, three promises.
 *
 * The skin is a flat bar whose top edge swells up around the bead. The
 * shoulders stay tangent to the flat edge, so the liquid never creases.
 * Every number below drives both the SVG path and the CSS custom
 * properties, so the skin and the buttons can never drift apart.
 * ------------------------------------------------------------------ */
const BEAD_R = 31;             // the bead's radius
const DOME_R = BEAD_R + 5;     // the swell is concentric with the bead: an even 5px of liquid around it
const CROWN_Y = 4;             // crown of the swell, measured from the top of the skin
const BEAD_CY = CROWN_Y + DOME_R;
const BAR_TOP = 52;            // where the flat top edge of the bar begins
const SHOULDER = 46;           // half the swell's width where it melts back into that flat edge
const SHOULDER_A = 16;         // shoulder control points (tangent out / tangent in)
const SHOULDER_B = 32;
const BAR_H = 84;              // icon + label + touch target below the top edge
const SKIN_H = BAR_TOP + BAR_H;
const TAP_ROUTE = "/patient/assistant";

/** Applied to `.phone` so the scrolling body reserves exactly the dock's height. */
export const DOCK_STYLE = {
  "--dock-h": `${SKIN_H}px`,
  "--bead-r": `${BEAD_R}px`,
  "--bead-cy": `${BEAD_CY}px`,
} as CSSProperties;

/** The swell: flat edge → tangent shoulder → crown over the bead → mirrored shoulder → flat edge. */
function swellPath(cx: number, width: number) {
  const k = Math.min(1, Math.max(0.74, width / 360)); // never let the swell crowd the buttons on a 320px screen
  const half = SHOULDER * k, a = SHOULDER_A * k, b = SHOULDER_B * k;
  const left = cx - half;
  return (
    `M0 ${BAR_TOP} L${left} ${BAR_TOP}` +
    ` C${left + a} ${BAR_TOP} ${cx - b} ${CROWN_Y} ${cx} ${CROWN_Y}` +
    ` C${cx + b} ${CROWN_Y} ${cx + half - a} ${BAR_TOP} ${cx + half} ${BAR_TOP} Z`
  );
}

/** Large, plain strokes: shape + label carry the meaning, never colour alone. */
function HomeIcon() {
  return (
    <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" focusable="false" aria-hidden="true">
      <path d="M4.5 14.5 16 5l11.5 9.5" /><path d="M7.5 13v13h17V13" /><path d="M13 26v-7h6v7" />
    </svg>
  );
}
function SettingsIcon() {
  return (
    <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" focusable="false" aria-hidden="true">
      <path d="M6 10.5h6M18 10.5h8M6 21.5h10M22 21.5h4" />
      <circle cx="15" cy="10.5" r="3.1" /><circle cx="19" cy="21.5" r="3.1" />
    </svg>
  );
}

/** The RAWA mark (heart + droplet) cropped out of the project's own /logo.png — no new artwork. */
function BrandMark() {
  return (
    <svg className="dock_bead-mark" viewBox="32 15 105 120" focusable="false" aria-hidden="true">
      <image href="/logo.png" xlinkHref="/logo.png" x="0" y="0" width="280" height="145" preserveAspectRatio="xMinYMid meet" />
    </svg>
  );
}

export default function PatientDock() {
  const { t } = useI18n();
  const { pathname } = useLocation();
  const ref = useRef<HTMLElement>(null);
  const [width, setWidth] = useState(360);
  const uid = useId().replace(/:/g, "");
  const onTaps = pathname === TAP_ROUTE;

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const read = () => setWidth(Math.round(el.getBoundingClientRect().width) || 360);
    read();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // A single soft swell when TAPs opens — no shake, no loop, nothing for reduced-motion users.
  const seen = useRef(onTaps);
  const [pop, setPop] = useState(false);
  useEffect(() => {
    if (seen.current === onTaps) return;
    seen.current = onTaps;
    if (!onTaps) return;
    setPop(true);
    const id = setTimeout(() => setPop(false), 620);
    return () => clearTimeout(id);
  }, [onTaps]);

  const item = (to: string, label: ReactNode, aria: string, end?: boolean, icon?: ReactNode) => (
    <NavLink key={to} to={to} end={end} aria-label={aria} className={({ isActive }) => `dock_item${isActive ? " is-on" : ""}`}>
      <span className="dock_item-ico">{icon}</span>
      <span className="dock_item-lbl">{label}</span>
      <span className="dock_item-dot" aria-hidden="true" />
    </NavLink>
  );

  return (
    <nav className="dock" ref={ref} style={DOCK_STYLE} aria-label={t("nav.patientArea")}>
      <svg className="dock_skin" width="100%" height="100%" focusable="false" aria-hidden="true">
        <defs>
          <linearGradient id={`dock-skin-${uid}`} gradientUnits="userSpaceOnUse" x1="0" y1={CROWN_Y} x2="0" y2={SKIN_H}>
            <stop offset="0" stopColor="#ffffff" />
            <stop offset="0.55" stopColor="#fdfcff" />
            <stop offset="1" stopColor="#f5f1ff" />
          </linearGradient>
        </defs>
        <rect x="0" y={BAR_TOP} width="100%" height="100%" fill={`url(#dock-skin-${uid})`} />
        <path d={swellPath(width / 2, width)} fill={`url(#dock-skin-${uid})`} />
      </svg>
      <div className="dock_items">
        {item("/patient", t("nav.home"), t("nav.homeAria"), true, <HomeIcon />)}
        <NavLink
          to={TAP_ROUTE}
          aria-label={t("nav.tapsAria")}
          className={`dock_bead-btn${onTaps ? " is-on" : ""}${pop ? " is-pop" : ""}`}
        >
          <span className="dock_bead" aria-hidden="true"><BrandMark /></span>
          <span className="dock_bead-lbl" aria-hidden="true"><b>{t("nav.taps")}</b><i>{t("nav.tapsHelper")}</i></span>
        </NavLink>
        {item("/patient/settings", t("nav.settings"), t("nav.settingsAria"), undefined, <SettingsIcon />)}
      </div>
    </nav>
  );
}