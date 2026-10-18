import { useState } from "react";
import type { Proposal } from "../api/types";
import { useI18n } from "../i18n";
import { Badge, Card, ConfirmDialog } from "./ui";

/** Simulated, dose-free workflow. Confirm/cancel each need an explicit dialog (human in the loop). */
export function ProposalCard({ proposals, onResolve, canResolve = true }: { proposals: Proposal[]; onResolve: (p: Proposal, action: "confirm" | "cancel") => Promise<void>; canResolve?: boolean }) {
  const { t, fmt } = useI18n();
  const [dlg, setDlg] = useState<{ p: Proposal; action: "confirm" | "cancel" } | null>(null);
  const [busy, setBusy] = useState(false);
  const variant = { pending: "warn", confirmed: "info", cancelled: "" } as const;
  return (
    <Card title={t("proposal.title")}>
      <div className="stack">
        <div className="notice">{t("proposal.text")}</div>
        {proposals.length === 0 && <p className="muted">{t("proposal.none")}</p>}
        {proposals.map((p) => (
          <div key={p.id} className="row-between" style={{ borderTop: "1px solid var(--border)", paddingTop: 12 }}>
            <div className="stack-sm">
              <Badge variant={variant[p.status]}>{t(`proposal.status.${p.status}`)}</Badge>
              <span className="xs muted num">{fmt.dateTime(p.created_at)}</span>
              {p.status !== "pending" && p.resolved_by && <span className="xs muted">{t("proposal.resolvedBy", { who: p.resolved_by })}</span>}
            </div>
            {p.status === "pending" && canResolve && (
              <div className="row">
                <button className="btn sm primary" onClick={() => setDlg({ p, action: "confirm" })}>{t("proposal.confirm")}</button>
                <button className="btn sm" onClick={() => setDlg({ p, action: "cancel" })}>{t("proposal.cancel")}</button>
              </div>
            )}
          </div>
        ))}
      </div>
      {dlg && (
        <ConfirmDialog
          title={dlg.action === "confirm" ? t("proposal.confirmTitle") : t("proposal.cancelTitle")}
          text={dlg.action === "confirm" ? t("proposal.confirmText") : t("proposal.cancelText")}
          confirmLabel={dlg.action === "confirm" ? t("proposal.confirm") : t("proposal.cancel")}
          busy={busy} onClose={() => setDlg(null)}
          onConfirm={async () => { setBusy(true); try { await onResolve(dlg.p, dlg.action); } finally { setBusy(false); setDlg(null); } }}
        />
      )}
    </Card>
  );
}

export function EmergencyPanel() {
  const { t } = useI18n();
  return <Card title={t("emergency.title")}><div className="notice danger">{t("emergency.text")}</div></Card>;
}
