export type ThemeId =
  | "defaultDark"
  | "crimson"
  | "royalBlue"
  | "highContrast"
  | "light";

export type ClockTheme = {
  id: ThemeId;
  name: string;
  description: string;
  pageClassName: string;
  panelClassName: string;
  clockPanelClassName: string;
  primaryTextClassName: string;
  secondaryTextClassName: string;
  mutedTextClassName: string;
  accentClassName: string;
  buttonClassName: string;
  inputClassName: string;
  infoCardClassName: string;
};

export const CLOCK_THEMES: Record<ThemeId, ClockTheme> = {
  defaultDark: {
    id: "defaultDark",
    name: "기본 다크",
    description: "어두운 남색/검정 배경과 청록 강조",
    pageClassName:
      "bg-[radial-gradient(circle_at_top,#0f766e_0%,#111827_42%,#030712_100%)] text-white",
    panelClassName:
      "border-white/10 bg-slate-950/70 text-white shadow-black/30",
    clockPanelClassName:
      "border-white/10 bg-black/25 text-white shadow-black/20",
    primaryTextClassName: "text-white",
    secondaryTextClassName: "text-slate-100",
    mutedTextClassName: "text-slate-300",
    accentClassName: "text-teal-100",
    buttonClassName:
      "bg-teal-300 text-slate-950 hover:bg-teal-200 focus:ring-teal-100",
    inputClassName:
      "border-white/10 bg-white/10 text-white placeholder:text-slate-500 focus:border-teal-200 focus:ring-teal-200/30",
    infoCardClassName: "border-white/10 bg-slate-950/60 text-white"
  },
  crimson: {
    id: "crimson",
    name: "크림슨 레드(고려대)",
    description: "어두운 와인/블랙 배경과 고려대 크림슨 강조",
    pageClassName:
      "bg-[radial-gradient(circle_at_top,#881337_0%,#111827_46%,#030712_100%)] text-white",
    panelClassName:
      "border-rose-200/10 bg-zinc-950/75 text-white shadow-black/30",
    clockPanelClassName:
      "border-rose-200/10 bg-black/30 text-white shadow-black/20",
    primaryTextClassName: "text-white",
    secondaryTextClassName: "text-rose-50",
    mutedTextClassName: "text-rose-100/75",
    accentClassName: "text-rose-100",
    buttonClassName:
      "bg-rose-300 text-zinc-950 hover:bg-rose-200 focus:ring-rose-100",
    inputClassName:
      "border-rose-200/10 bg-white/10 text-white placeholder:text-rose-100/40 focus:border-rose-200 focus:ring-rose-200/30",
    infoCardClassName: "border-rose-200/10 bg-zinc-950/65 text-white"
  },
  royalBlue: {
    id: "royalBlue",
    name: "로얄 블루(연세대)",
    description: "연세대 로얄 블루 기반의 깊은 파랑 테마",
    pageClassName:
      "bg-[radial-gradient(circle_at_top,#005eb8_0%,#003876_38%,#020617_100%)] text-white",
    panelClassName:
      "border-sky-100/15 bg-blue-950/75 text-white shadow-black/30",
    clockPanelClassName:
      "border-sky-100/15 bg-blue-950/35 text-white shadow-black/20",
    primaryTextClassName: "text-white",
    secondaryTextClassName: "text-sky-50",
    mutedTextClassName: "text-sky-100/75",
    accentClassName: "text-sky-100",
    buttonClassName:
      "bg-sky-200 text-blue-950 hover:bg-white focus:ring-sky-100",
    inputClassName:
      "border-sky-100/15 bg-white/10 text-white placeholder:text-sky-100/40 focus:border-sky-200 focus:ring-sky-200/30",
    infoCardClassName: "border-sky-100/15 bg-blue-950/65 text-white"
  },
  highContrast: {
    id: "highContrast",
    name: "고대비",
    description: "검정 배경과 노랑/흰색 강조",
    pageClassName: "bg-black text-white",
    panelClassName: "border-white/25 bg-black text-white shadow-black",
    clockPanelClassName: "border-white/20 bg-black text-white shadow-black",
    primaryTextClassName: "text-white",
    secondaryTextClassName: "text-white",
    mutedTextClassName: "text-zinc-200",
    accentClassName: "text-yellow-200",
    buttonClassName:
      "bg-yellow-300 text-black hover:bg-yellow-200 focus:ring-yellow-100",
    inputClassName:
      "border-white/25 bg-black text-white placeholder:text-zinc-500 focus:border-yellow-200 focus:ring-yellow-200/30",
    infoCardClassName: "border-white/25 bg-black text-white"
  },
  light: {
    id: "light",
    name: "라이트",
    description: "밝은 배경과 진한 파랑 강조",
    pageClassName:
      "bg-[radial-gradient(circle_at_top,#dbeafe_0%,#f8fafc_44%,#e5e7eb_100%)] text-slate-950",
    panelClassName:
      "border-slate-300 bg-white/85 text-slate-950 shadow-slate-400/30",
    clockPanelClassName:
      "border-slate-300 bg-white/70 text-slate-950 shadow-slate-400/25",
    primaryTextClassName: "text-slate-950",
    secondaryTextClassName: "text-slate-900",
    mutedTextClassName: "text-slate-600",
    accentClassName: "text-blue-900",
    buttonClassName:
      "bg-blue-700 text-white hover:bg-blue-600 focus:ring-blue-300",
    inputClassName:
      "border-slate-300 bg-white text-slate-950 placeholder:text-slate-400 focus:border-blue-500 focus:ring-blue-200",
    infoCardClassName: "border-slate-300 bg-white/85 text-slate-950"
  }
};

export function normalizeThemeId(value: unknown): ThemeId {
  if (
    value === "defaultDark" ||
    value === "crimson" ||
    value === "royalBlue" ||
    value === "highContrast" ||
    value === "light"
  ) {
    return value;
  }

  return "defaultDark";
}
