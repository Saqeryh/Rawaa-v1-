import { useEffect, useRef, useState } from "react";
import { answer, detectIntent, QUICK, type Intent } from "../../assistant/knowledge";
import { useI18n } from "../../i18n";
import { useConfig } from "../../hooks/useConfig";
import { Card } from "../../components/ui";
import { usePatient } from "./context";

interface Msg { who: "user" | "bot"; text: string }

export default function Assistant() {
  const { t, fmt, name, lang } = useI18n();
  const { patient } = usePatient();
  const { config } = useConfig();
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView?.({ block: "end" }); }, [msgs]);

  const reply = (intent: Intent, userText: string) => {
    const text = answer(intent, { t, fmt, name, biomarkers: config?.biomarkers ?? [], patient });
    setMsgs((m) => [...m, { who: "user", text: userText }, { who: "bot", text }]);
  };
  const send = () => { const q = input.trim(); if (!q) return; setInput(""); reply(detectIntent(q, lang), q); };

  return (
    <>
      <h1>{t("assistant.title")}</h1>
      <div className="notice info">{t("assistant.intro")}</div>
      <div className="notice xs">{t("assistant.disclaimer")}</div>
      <Card tight>
        <div className="chat" role="log" aria-live="polite" aria-label={t("assistant.title")}>
          {msgs.map((m, i) => (
            <div key={i} className={`bubble ${m.who}`}>
              <div className="xs" style={{ opacity: .75 }}>{m.who === "user" ? t("assistant.you") : t("assistant.bot")}</div>
              {m.text}
            </div>
          ))}
          <div ref={end} />
        </div>
      </Card>
      <div className="chips">{QUICK.map((q) => <button key={q.key} className="chip" onClick={() => reply(q.intent, t(`assistant.quick.${q.key}`))}>{t(`assistant.quick.${q.key}`)}</button>)}</div>
      <div className="row" style={{ flexWrap: "nowrap" }}>
        <label htmlFor="ask" className="sr-only">{t("assistant.placeholder")}</label>
        <input id="ask" className="input" value={input} placeholder={t("assistant.placeholder")} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") send(); }} />
        <button className="btn primary" onClick={send}>{t("assistant.send")}</button>
      </div>
    </>
  );
}
