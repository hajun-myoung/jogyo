import { normalizeThemeId, type ThemeId } from "./themes";

export type ClockPreset = {
  id: string;
  name: string;
  examTitle: string;
  endTimeInput: string;
  instructions: string;
  themeId: ThemeId;
  organizationName: string;
  logoDataUrl?: string | null;
  createdAt: number;
  updatedAt: number;
};

export type LastSettings = {
  examTitle: string;
  endTimeInput: string;
  instructions: string;
  themeId: ThemeId;
  organizationName: string;
  logoDataUrl?: string | null;
};

const PRESETS_KEY = "jogyo-clock-presets";
const LAST_SETTINGS_KEY = "jogyo-clock-last-settings";

function canUseStorage() {
  try {
    return (
      typeof window !== "undefined" &&
      typeof window.localStorage !== "undefined"
    );
  } catch {
    return false;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function normalizeText(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function normalizeTimestamp(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : Date.now();
}

function normalizePreset(value: unknown): ClockPreset | null {
  if (!isRecord(value)) {
    return null;
  }

  const id = normalizeText(value.id);
  const name = normalizeText(value.name);
  const examTitle = normalizeText(value.examTitle);
  const endTimeInput = normalizeText(value.endTimeInput);
  const instructions = normalizeText(value.instructions);

  if (!id || !name || !examTitle || !endTimeInput) {
    return null;
  }

  return {
    id,
    name,
    examTitle,
    endTimeInput,
    instructions,
    themeId: normalizeThemeId(value.themeId),
    organizationName: normalizeText(value.organizationName, "Jogyo Clock"),
    logoDataUrl: normalizeText(value.logoDataUrl) || null,
    createdAt: normalizeTimestamp(value.createdAt),
    updatedAt: normalizeTimestamp(value.updatedAt)
  };
}

export function safeReadPresets(): ClockPreset[] {
  if (!canUseStorage()) {
    return [];
  }

  try {
    const rawValue = window.localStorage.getItem(PRESETS_KEY);

    if (!rawValue) {
      return [];
    }

    const parsedValue: unknown = JSON.parse(rawValue);

    if (!Array.isArray(parsedValue)) {
      return [];
    }

    return parsedValue
      .map((item) => normalizePreset(item))
      .filter((item): item is ClockPreset => item !== null)
      .sort((a, b) => b.updatedAt - a.updatedAt);
  } catch {
    return [];
  }
}

export function safeWritePresets(presets: ClockPreset[]) {
  if (!canUseStorage()) {
    return;
  }

  try {
    window.localStorage.setItem(PRESETS_KEY, JSON.stringify(presets));
  } catch {
    // localStorage can be unavailable or full; keep the app usable.
  }
}

export function safeReadLastSettings(): LastSettings | null {
  if (!canUseStorage()) {
    return null;
  }

  try {
    const rawValue = window.localStorage.getItem(LAST_SETTINGS_KEY);

    if (!rawValue) {
      return null;
    }

    const parsedValue: unknown = JSON.parse(rawValue);

    if (!isRecord(parsedValue)) {
      return null;
    }

    const examTitle = normalizeText(parsedValue.examTitle);
    const endTimeInput = normalizeText(parsedValue.endTimeInput);

    if (!examTitle || !endTimeInput) {
      return null;
    }

    return {
      examTitle,
      endTimeInput,
      instructions: normalizeText(parsedValue.instructions),
      themeId: normalizeThemeId(parsedValue.themeId),
      organizationName: normalizeText(parsedValue.organizationName, "Jogyo Clock"),
      logoDataUrl: normalizeText(parsedValue.logoDataUrl) || null
    };
  } catch {
    return null;
  }
}

export function safeWriteLastSettings(settings: LastSettings) {
  if (!canUseStorage()) {
    return;
  }

  try {
    window.localStorage.setItem(LAST_SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // localStorage can be unavailable or full; keep the app usable.
  }
}

export function createPresetId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `preset-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
