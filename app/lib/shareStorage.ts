import {
  doc,
  getDocFromServer,
  onSnapshot,
  setDoc,
  updateDoc,
  type Firestore,
  type Unsubscribe
} from "firebase/firestore";
import {
  isRecord,
  normalizeText,
  normalizeTimestamp
} from "./storage";
import { normalizeThemeId, type ThemeId } from "./themes";

export type ShareStatus = "running" | "paused" | "ended";

export type SharedClock = {
  id: string;
  ownerUid: string;
  roomId?: string | null;
  roomName?: string;
  examTitle: string;
  endDateTime: number;
  endTimeInput: string;
  instructions: string;
  themeId: ThemeId;
  organizationName: string;
  logoDataUrl?: string | null;
  isPaused: boolean;
  pausedRemainingMs?: number | null;
  status: ShareStatus;
  isPublic: boolean;
  createdAt: number;
  updatedAt: number;
  expiresAt?: number | null;
};

function normalizeNumber(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function normalizeNullableNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalizeShareStatus(value: unknown): ShareStatus {
  if (value === "running" || value === "paused" || value === "ended") {
    return value;
  }

  return "running";
}

export function createShareId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `share-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function normalizeSharedClock(value: unknown): SharedClock | null {
  if (!isRecord(value)) {
    return null;
  }

  const id = normalizeText(value.id);
  const ownerUid = normalizeText(value.ownerUid);
  const examTitle = normalizeText(value.examTitle);
  const endTimeInput = normalizeText(value.endTimeInput);

  if (!id || !ownerUid || !examTitle || !endTimeInput) {
    return null;
  }

  return {
    id,
    ownerUid,
    roomId: normalizeText(value.roomId) || null,
    roomName: normalizeText(value.roomName),
    examTitle,
    endDateTime: normalizeNumber(value.endDateTime),
    endTimeInput,
    instructions: normalizeText(value.instructions),
    themeId: normalizeThemeId(value.themeId),
    organizationName: normalizeText(value.organizationName, "Jogyo Clock"),
    logoDataUrl: normalizeText(value.logoDataUrl) || null,
    isPaused: value.isPaused === true,
    pausedRemainingMs: normalizeNullableNumber(value.pausedRemainingMs),
    status: normalizeShareStatus(value.status),
    isPublic: value.isPublic === true,
    createdAt: normalizeTimestamp(value.createdAt),
    updatedAt: normalizeTimestamp(value.updatedAt),
    expiresAt: normalizeNullableNumber(value.expiresAt)
  };
}

export async function createSharedClock({
  db,
  sharedClock
}: {
  db: Firestore;
  sharedClock: SharedClock;
}) {
  await setDoc(doc(db, "sharedClocks", sharedClock.id), sharedClock);
}

export async function updateSharedClock({
  db,
  sharedClock
}: {
  db: Firestore;
  sharedClock: SharedClock;
}) {
  await setDoc(doc(db, "sharedClocks", sharedClock.id), sharedClock, {
    merge: true
  });
}

export async function getSharedClock({
  db,
  shareId
}: {
  db: Firestore;
  shareId: string;
}) {
  const snapshot = await getDocFromServer(doc(db, "sharedClocks", shareId));

  if (!snapshot.exists()) {
    return null;
  }

  return normalizeSharedClock(snapshot.data());
}

export async function stopSharedClock({
  db,
  shareId
}: {
  db: Firestore;
  shareId: string;
}) {
  await updateDoc(doc(db, "sharedClocks", shareId), {
    isPublic: false,
    updatedAt: Date.now()
  });
}

export function subscribeSharedClock({
  db,
  shareId,
  onNext,
  onError
}: {
  db: Firestore;
  shareId: string;
  onNext: (sharedClock: SharedClock | null) => void;
  onError: (error: Error) => void;
}): Unsubscribe {
  return onSnapshot(
    doc(db, "sharedClocks", shareId),
    (snapshot) => {
      if (!snapshot.exists()) {
        onNext(null);
        return;
      }

      onNext(normalizeSharedClock(snapshot.data()));
    },
    onError
  );
}
