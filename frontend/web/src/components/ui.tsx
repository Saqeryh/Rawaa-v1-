import React, { useEffect, useId, useRef, type ReactNode } from "react";
import { ApiError } from "../api/client";
import { useI18n, type TFn } from "../i18n";
import { useTheme } from "../hooks/useTheme";

export function Card({ title, actions, children, className = "", tight = false, id, "aria-label": ariaLabel }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; tight?: boolean; id?: string; "aria-label"?: string }) {
  const titleId = useId();
  const hasTitle = Boolean(title);
  return (
    <section className={`card ${tight ? "tight" : ""} ${className}`} id={id} aria-label={ariaLabel} aria-labelledby={hasTitle && !ariaLabel && typeof title !== "string" ? titleId : undefined}>
      {(title || actions) && <div className="card-title"><h2 id={hasTitle && !ariaLabel && typeof title !== "string" ? titleId : undefined}>{title}</h2>{actions && <div className="row">{actions}</div>}</div>}
      {children}
    </section>
  );
}

export function Badge({ variant = "", glyph, children, title }: { variant?: "" | "ok" | "warn" | "orange" | "danger" | "info" | "primary"; glyph?: string; children: ReactNode; title?: string }) {
  return <span className={`badge ${variant}`} title={title}>{glyph && <span className="glyph" aria-hidden="true">{glyph}</span>}{children}</span>;
}

export function Skeleton({ height = 18, width = "100%" }: { height?: number; width?: number | string }) {
  return <div className="skeleton" style={{ height, width }} aria-hidden="true" />;
}

export function LoadingBlock({ rows = 3 }: { rows?: number }) {
  const { t } = useI18n();
  return (
    <div className="stack-sm" role="status" aria-live="polite" aria-label={t("common.loading")}>
      {Array.from({ length: rows }, (_, i) => <Skeleton key={i} height={i === 0 ? 28 : 18} width={i === 0 ? "45%" : "100%"} />)}
      <span className="sr-only">{t("common.loading")}</span>
    </div>
  );
}

export function EmptyState({ children }: { children?: ReactNode }) {
  const { t } = useI18n();
  return <div className="empty" role="note">{children ?? t("common.empty")}</div>;
}

const SunIcon = () => (
  <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true">
    <circle cx={12} cy={12} r={4} />
    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M6.3 17.7l-1.4 1.4M19.1 4.9l-1.4 1.4" />
  </svg>
);
const MoonIcon = () => (
  <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
  </svg>
);

/** Theme toggle: persists the choice (localStorage) and switches the whole UI by toggling <html data-theme>. */
export function ThemeToggle({ busy, variant = "pill" }: { busy?: boolean; variant?: "pill" | "icon" }) {
  const { t } = useI18n();
  const { isDark, toggle } = useTheme();
  const next = isDark ? t("settings.themeLight") : t("settings.themeDark");
  const label = `${t("settings.theme")}: ${next}`;
  if (variant === "icon") {
    return (
      <button className="theme-icon-btn" onClick={toggle} title={label} aria-label={label} disabled={busy} aria-pressed={isDark}>
        {isDark ? <SunIcon /> : <MoonIcon />}
      </button>
    );
  }
  return (
    <button className="btn sm" onClick={toggle} title={label} disabled={busy} aria-pressed={isDark}>
      {isDark ? <SunIcon /> : <MoonIcon />}
      {next}
    </button>
  );
}

export function errorKey(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 0) return "common.errorNetwork";
    if (err.status === 403) return "common.errorForbidden";
    if (err.status === 404) return "common.errorNotFound";
  }
  return "common.errorGeneric";
}
export const errorText = (t: TFn, err: unknown) => t(errorKey(err));

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const { t } = useI18n();
  return (
    <div className="error-box" role="alert">
      <strong>{t("common.error")}</strong>
      <p className="small">{errorText(t, error)}</p>
      {onRetry && <button className="btn sm" onClick={onRetry} style={{ marginTop: 12 }}>{t("common.retry")}</button>}
    </div>
  );
}

/** Accessible modal: role=dialog, labelled, Escape closes, focus moves inside. */
export function Dialog({ title, children, onClose, actions }: { title: string; children: ReactNode; onClose: () => void; actions?: ReactNode }) {
  const id = useId();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>("input, select, textarea, button")?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("keydown", onKey); prev?.focus?.(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div className="overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="dialog" role="dialog" aria-modal="true" aria-labelledby={id} ref={ref}>
        <h2 id={id}>{title}</h2>
        {children}
        {actions && <div className="actions">{actions}</div>}
      </div>
    </div>
  );
}

export function ConfirmDialog({ title, text, confirmLabel, danger, busy, onConfirm, onClose }: { title: string; text: string; confirmLabel: string; danger?: boolean; busy?: boolean; onConfirm: () => void; onClose: () => void }) {
  const { t } = useI18n();
  return (
    <Dialog title={title} onClose={onClose} actions={<>
      <button className="btn" onClick={onClose}>{t("common.cancel")}</button>
      <button className={`btn ${danger ? "danger" : "primary"}`} onClick={onConfirm} disabled={busy}>{confirmLabel}</button>
    </>}>
      <p>{text}</p>
    </Dialog>
  );
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return <div className="stat"><span className="value num">{value}</span><span className="label">{label}</span>{hint}</div>;
}

export function Field({ label, error, children, htmlFor }: { label: string; error?: string | null; children: ReactNode; htmlFor: string }) {
  return (
    <div className="field">
      <label htmlFor={htmlFor}>{label}</label>
      {children}
      {error && <span className="field-error" role="alert">{error}</span>}
    </div>
  );
}
