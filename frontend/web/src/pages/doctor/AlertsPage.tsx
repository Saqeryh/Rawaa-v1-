import { useState } from "react";
import { api } from "../../api/endpoints";
import { useSession } from "../../auth/session";
import { useI18n } from "../../i18n";
import { useApi } from "../../hooks/useApi";
import { useAction } from "../../hooks/useAction";
import { AlertList } from "../../components/AlertList";
import { ConnectionIndicator } from "../../components/shared";
import { Card, ErrorState, LoadingBlock } from "../../components/ui";

export default function AlertsPage() {
  const { t } = useI18n();
  const { session } = useSession();
  const tok = session?.token ?? null;
  const [status, setStatus] = useState<"open" | "">("open");
  const { data, error, loading, reload, refresh, connection, lastSuccess } = useApi(() => api.alerts(tok, { status: status || undefined }), [tok, status], { pollMs: 5000 });
  const { run, error: ackError } = useAction();
  const [busy, setBusy] = useState<number | null>(null);
  return (
    <>
      <div className="topbar">
        <h1>{t("alert.title")}</h1>
        <div className="row"><ConnectionIndicator state={connection} lastUpdate={lastSuccess} />
          <div className="segmented" role="group" aria-label={t("common.status")}>
            <button aria-pressed={status === "open"} onClick={() => setStatus("open")}>{t("alert.filterOpen")}</button>
            <button aria-pressed={status === ""} onClick={() => setStatus("")}>{t("alert.filterAll")}</button>
          </div></div>
      </div>
      {loading && !data && <LoadingBlock rows={4} />}
      {error && !data && <ErrorState error={error} onRetry={reload} />}
      {data && <Card><AlertList alerts={data} showPatient busyId={busy} onAcknowledge={async (a) => { setBusy(a.id); await run(() => api.acknowledge(tok, a.id)); setBusy(null); refresh(); }} /></Card>}
      {ackError ? <ErrorState error={ackError} /> : null}
    </>
  );
}
