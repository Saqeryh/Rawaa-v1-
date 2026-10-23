import { useI18n } from "../../i18n";
import { AlertList } from "../../components/AlertList";
import { usePatient } from "./context";

/** Dedicated notifications view — the header bell links here; the patient only ever sees their own alerts. */
export default function NotificationsPage() {
  const { t } = useI18n();
  const { alerts } = usePatient();
  return (
    <>
      <h1>{t("patientApp.notifications")}</h1>
      {alerts.length === 0 ? <p className="muted">{t("patientApp.noNotifications")}</p> : <AlertList alerts={alerts} />}
    </>
  );
}
