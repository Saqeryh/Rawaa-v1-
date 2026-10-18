import React, { useEffect, useId, useRef, type ReactNode } from "react";
import { ApiError } from "../api/client";
import { useI18n, type TFn } from "../i18n";

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

/** Theme toggle button: switches light/dark by toggling html data-theme attribute */
export function ThemeToggle({ busy }: { busy?: boolean }) {
  const [isDark, setIsDark] = React.useState(() => {
    // Check for persisted preference or default to light
    const html = document.documentElement;
    return html.getAttribute("data-theme") === "dark";
  });
  
  React.useEffect(() => {
    const html = document.documentElement;
    if (isDark) {
      html.setAttribute("data-theme", "dark");
      html.style.colorScheme = "dark";
    } else {
      html.removeAttribute("data-theme");
      html.style.colorScheme = "light";
    }
  }, [isDark]);
  
  return (
    <button
      className="btn sm"
      onClick={() => setIsDark(!isDark)}
      title={"Toggle dark mode"}
      disabled={busy}
      aria-pressed={isDark}
      style={{}}
    >
      <svg
        width={18}
        height={18}
        viewBox={isDark ? "0 0 24 24" : "0 0 24 24"}
        fill={isDark ? "none" : "none"}
        stroke={isDark ? "currentColor" : "currentColor"}
      >
        {isDark ? (
          <path d="M12 3v5M5 12h5M19 19l-5-5M5 5l5 5" />
        ) : (
          <path d="M12 12hM5 12vM12 5hM12 19l5 5M19 5l-5 5" />
        )}
      </svg>
      {isDark ? "Light" : "Dark"}
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
