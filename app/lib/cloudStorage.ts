import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  writeBatch,
  type Firestore
} from "firebase/firestore";
import {
  isRecord,
  normalizePreset,
  normalizeText,
  normalizeTimestamp,
  type ClockPreset,
  type LastSettings
} from "./storage";
import { normalizeThemeId } from "./themes";

type CloudLastSettings = LastSettings & {
  updatedAt: number;
};

function normalizeCloudLastSettings(value: unknown): CloudLastSettings | null {
  if (!isRecord(value)) {
    return null;
  }

  const examTitle = normalizeText(value.examTitle);
  const endTimeInput = normalizeText(value.endTimeInput);

  if (!examTitle || !endTimeInput) {
    return null;
  }

  return {
    examTitle,
    endTimeInput,
    instructions: normalizeText(value.instructions),
    themeId: normalizeThemeId(value.themeId),
    organizationName: normalizeText(value.organizationName, "Jogyo Clock"),
    logoDataUrl: normalizeText(value.logoDataUrl) || null,
    updatedAt: normalizeTimestamp(value.updatedAt)
  };
}

function toCloudLastSettings(settings: LastSettings): CloudLastSettings {
  return {
    ...settings,
    themeId: normalizeThemeId(settings.themeId),
    logoDataUrl: settings.logoDataUrl || null,
    updatedAt: Date.now()
  };
}

export async function saveLastSettingsToCloud({
  db,
  uid,
  settings
}: {
  db: Firestore;
  uid: string;
  settings: LastSettings;
}) {
  await setDoc(doc(db, "users", uid, "settings", "last"), toCloudLastSettings(settings));
}

export async function savePresetsToCloud({
  db,
  uid,
  presets
}: {
  db: Firestore;
  uid: string;
  presets: ClockPreset[];
}) {
  const batch = writeBatch(db);

  presets.forEach((preset) => {
    batch.set(doc(db, "users", uid, "presets", preset.id), {
      ...preset,
      themeId: normalizeThemeId(preset.themeId),
      logoDataUrl: preset.logoDataUrl || null
    });
  });

  await batch.commit();
}

export async function loadCloudData({
  db,
  uid
}: {
  db: Firestore;
  uid: string;
}) {
  const [lastSettingsSnapshot, presetsSnapshot] = await Promise.all([
    getDoc(doc(db, "users", uid, "settings", "last")),
    getDocs(collection(db, "users", uid, "presets"))
  ]);

  const lastSettings = lastSettingsSnapshot.exists()
    ? normalizeCloudLastSettings(lastSettingsSnapshot.data())
    : null;
  const presets = presetsSnapshot.docs
    .map((presetDoc) => normalizePreset(presetDoc.data()))
    .filter((preset): preset is ClockPreset => preset !== null)
    .sort((a, b) => b.updatedAt - a.updatedAt);

  return {
    lastSettings,
    presets
  };
}
