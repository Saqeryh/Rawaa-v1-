import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Lang, LocalizedNames } from "../api/types";
import en from "./en.json";
import ar from "./ar.json";
import ko from "./ko.json";

const DICTS: Record<Lang, any> = { en, ar, ko };
export const LANGS: Lang[] = ["ar", "en", "ko"];
// Arabic uses the Gregory calendar and Latin digits so measured values, units and dates stay unambiguous.
export const LANG_META: Record<Lang, { label: string; dir: "rtl" | "ltr"; locale: string }> = {
  ar: { label: "العربية", dir: "rtl", locale: "ar-SA-u-ca-gregory-nu-latn" },
  en: { label: "English", dir: "ltr", locale: "en-US" },
  ko: { label: "한국어", dir: "ltr", locale: "ko-KR" },
};
const STORAGE_KEY = "rawa.lang";

function lookup(dict: any, key: string): string | undefined {
  let cur = dict;
  for (const part of key.split(".")) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = cur[part];
  }
  return typeof cur === "string" ? cur : undefined;
}

export type TFn = (key: string, params?: Record<string, string | number>) => string;

export function translate(lang: Lang, key: string, params?: Record<string, string | number>): string {
  const raw = lookup(DICTS[lang], key) ?? lookup(DICTS.en, key) ?? key;
  return params ? raw.replace(/\{(\w+)\}/g, (_, k) => (k in params ? String(params[k]) : `{${k}}`)) : raw;
}

export function makeFormatters(lang: Lang) {
  const locale = LANG_META[lang].locale;
  const num = (v: number | null | undefined, max?: number) => {
    // Missing values are NEVER rendered as zero.
    if (v === null || v === undefined || Number.isNaN(v)) return "—";
    const digits = max ?? (Math.abs(v) < 1 ? 3 : 2);
    return new Intl.NumberFormat(locale, { maximumFractionDigits: digits }).format(v);
  };
  const toDate = (iso: string) => new Date(iso.endsWith("Z") || /[+-]\d\d:\d\d$/.test(iso) ? iso : iso + "Z");
  const dateTime = (iso: string | null | undefined) =>
    iso ? new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(toDate(iso)) : "—";
  const time = (ms: number) => new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit" }).format(new Date(ms));
  const dateOnly = (iso: string | null | undefined) => (iso ? new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(toDate(iso)) : "—");
  const relative = (iso: string | null | undefined, now = Date.now()) => {
    if (!iso) return "—";
    const diff = Math.round((toDate(iso).getTime() - now) / 1000);
    const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
    const abs = Math.abs(diff);
    if (abs < 60) return rtf.format(diff, "second");
    if (abs < 3600) return rtf.format(Math.round(diff / 60), "minute");
    if (abs < 86400) return rtf.format(Math.round(diff / 3600), "hour");
    return rtf.format(Math.round(diff / 86400), "day");
  };
  const percent = (v: number | null | undefined) =>
    v === null || v === undefined ? "—" : new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 0, signDisplay: "exceptZero" }).format(v);
  return { number: num, dateTime, dateOnly, time, relative, percent, toMs: (iso: string) => toDate(iso).getTime() };
}

interface I18nValue {
  lang: Lang; dir: "rtl" | "ltr"; setLang: (l: Lang) => void; t: TFn;
  fmt: ReturnType<typeof makeFormatters>; name: (n: LocalizedNames) => string;
}
const Ctx = createContext<I18nValue | null>(null);

function initialLang(): Lang {
  try {
    const s = localStorage.getItem(STORAGE_KEY);
    if (s === "ar" || s === "en" || s === "ko") return s;
  } catch { /* storage unavailable */ }
  return "ar";
}

export function I18nProvider({ children, initial }: { children: ReactNode; initial?: Lang }) {
  const [lang, setLangState] = useState<Lang>(initial ?? initialLang());
  const dir = LANG_META[lang].dir;
  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = dir;
  }, [lang, dir]);
  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    try { localStorage.setItem(STORAGE_KEY, l); } catch { /* ignore */ }
  }, []);
  const value = useMemo<I18nValue>(() => ({
    lang, dir, setLang, t: (k, p) => translate(lang, k, p), fmt: makeFormatters(lang), name: (n) => n[lang] ?? n.en,
  }), [lang, dir, setLang]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useI18n(): I18nValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useI18n must be used inside I18nProvider");
  return v;
}
