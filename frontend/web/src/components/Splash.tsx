import { useEffect, useState } from "react";
import { useI18n } from "../i18n";

/**
 * Full-screen loading splash: the existing /logo.png, the project name and a translated tagline.
 * Splash is skipped under Vitest (import.meta.env.VITEST) because it is a timed overlay; the component
 * itself is covered by tests that render it directly with autoHide={false}.
 */
export function Splash({ showMs = 1400, autoHide = true }: { showMs?: number; autoHide?: boolean }) {
  const { t } = useI18n();
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    if (!autoHide) return;
    const h = setTimeout(() => setVisible(false), showMs);
    return () => clearTimeout(h);
  }, [autoHide, showMs]);
  if (!visible) return null;
  return (
    <div className="splash" role="status" aria-live="polite" data-testid="splash">
      <img src="/logo.png" alt="" width={160} height={80} onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
      <div className="splash-name">{t("app.name")}</div>
      <div className="splash-tagline">{t("splash.tagline")}</div>
      <div className="splash-spinner" aria-hidden="true" />
      <div className="xs muted">{t("common.loading")}</div>
      <div className="splash-demo">{t("splash.demo")}</div>
    </div>
  );
}

/** Mounts the timed splash on app start (never in unit tests). */
export function SplashGate() {
  if (import.meta.env.VITEST) return null;
  return <Splash />;
}
