/** RAWA assistant: a FIXED, controlled knowledge base (no medical AI is connected).
 *  Intent detection is keyword-based per language. Medication/dose questions are always refused. */
import type { Lang, PatientDetail } from "../api/types";

export type Intent = "categories" | "latest" | "lastUpdate" | "hscrp" | "risk" | "features" | "medication" | "emergency" | "notDoctor" | "fallback";

// Order matters: safety intents are checked first.
const KEYWORDS: [Intent, Record<Lang, string[]>][] = [
  ["emergency", { en: ["emergency", "chest pain", "can't breathe", "cannot breathe", "severe pain", "faint", "collapse"], ar: ["طوارئ", "ألم في الصدر", "الم في الصدر", "لا أستطيع التنفس", "إغماء", "اغماء"], ko: ["응급", "가슴 통증", "호흡곤란", "숨을 못", "실신"] }],
  ["medication", { en: ["medication", "medicine", "dose", "dosage", "drug", "pill", "anticoagulant", "blood thinner", "inject", "mg"], ar: ["دواء", "جرعة", "أدوية", "ادوية", "مسيل", "حقنة", "علاج"], ko: ["약", "용량", "복용", "투여", "항응고", "주사"] }],
  ["notDoctor", { en: ["diagnose", "diagnosis", "do i have", "am i going to", "clot", "treat me", "should i worry"], ar: ["شخّص", "شخص حالتي", "هل لدي", "هل عندي", "جلطة", "أقلق", "اقلق"], ko: ["진단", "제가 걸렸", "혈전이 있", "걱정해야"] }],
  ["categories", { en: ["categor", "four", "levels", "what do the"], ar: ["فئات", "الفئات", "أربع", "اربع", "مستويات"], ko: ["범주", "네 가지", "단계", "분류가 뭐"] }],
  ["risk", { en: ["classification", "my risk", "current risk", "status"], ar: ["تصنيفي", "خطري", "تصنيف"], ko: ["내 분류", "내 위험", "현재 분류", "위험"] }],
  ["lastUpdate", { en: ["last updated", "when was", "last update", "how recent", "synced"], ar: ["آخر تحديث", "متى آخر", "متى حُدِّثت", "متى حدثت"], ko: ["마지막 업데이트", "언제", "최근 업데이트"] }],
  ["hscrp", { en: ["crp", "c-reactive", "inflammat"], ar: ["crp", "التفاعلي", "التهاب"], ko: ["crp", "c-반응성", "염증"] }],
  ["latest", { en: ["latest", "readings", "my values", "explain my", "results"], ar: ["أحدث", "قراءاتي", "قراءات", "نتائجي"], ko: ["최근 측정", "측정값", "내 결과", "설명해"] }],
  ["features", { en: ["what can", "features", "how do i use", "help", "app do"], ar: ["ماذا يستطيع", "ميزات", "كيف أستخدم", "مساعدة"], ko: ["무엇을 할", "기능", "사용 방법", "도움"] }],
];

export function detectIntent(text: string, lang: Lang): Intent {
  const q = text.trim().toLowerCase();
  if (!q) return "fallback";
  for (const [intent, kw] of KEYWORDS) {
    if (kw[lang].some((k) => q.includes(k.toLowerCase())) || (lang !== "en" && kw.en.some((k) => q.includes(k)))) return intent;
  }
  return "fallback";
}

export const QUICK: { intent: Intent; key: string }[] = [
  { intent: "categories", key: "categories" }, { intent: "latest", key: "latest" }, { intent: "lastUpdate", key: "lastUpdate" },
  { intent: "hscrp", key: "hscrp" }, { intent: "risk", key: "risk" }, { intent: "features", key: "features" },
];

export interface AnswerCtx {
  t: (k: string, p?: Record<string, string | number>) => string;
  fmt: { number: (v: number | null | undefined) => string; dateTime: (s: string | null | undefined) => string; relative: (s: string | null | undefined) => string };
  name: (n: any) => string;
  biomarkers: { id: string; names: any; abbreviation: string; unit: string }[];
  patient: PatientDetail | null;
}

/** Build the answer from the same records the app displays (single source of truth). */
export function answer(intent: Intent, c: AnswerCtx): string {
  const { t, patient } = c;
  switch (intent) {
    case "latest": {
      if (!patient) return t("assistant.a.latestEmpty");
      const parts = c.biomarkers.flatMap((b) => {
        const r = patient.latest_biomarkers[b.id];
        if (!r || r.quality === "missing" || r.value === null) return [];
        return [`${b.abbreviation} ${c.fmt.number(r.value)} ${b.unit}`];
      });
      return parts.length ? t("assistant.a.latest", { summary: parts.join(", ") }) : t("assistant.a.latestEmpty");
    }
    case "lastUpdate":
      return patient?.last_update ? t("assistant.a.lastUpdate", { time: c.fmt.dateTime(patient.last_update), relative: c.fmt.relative(patient.last_update) }) : t("assistant.a.lastUpdateNone");
    case "risk": {
      const r = patient?.risk;
      if (!r || r.status !== "ok" || !r.category_key) return t("assistant.a.riskNone");
      return t("assistant.a.risk", { category: t(`risk.${r.category_key}`), origin: t(`risk.source.${r.source}`) });
    }
    default:
      return t(`assistant.a.${intent}`);
  }
}
