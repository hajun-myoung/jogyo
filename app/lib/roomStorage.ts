import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  setDoc,
  updateDoc,
  type Firestore
} from "firebase/firestore";
import {
  isRecord,
  normalizeText,
  normalizeTimestamp
} from "./storage";

export type Room = {
  id: string;
  name: string;
  description?: string;
  currentShareId?: string | null;
  createdAt: number;
  updatedAt: number;
};

export function createRoomId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `room-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function normalizeRoom(value: unknown): Room | null {
  if (!isRecord(value)) {
    return null;
  }

  const id = normalizeText(value.id);
  const name = normalizeText(value.name);

  if (!id || !name) {
    return null;
  }

  return {
    id,
    name,
    description: normalizeText(value.description),
    currentShareId: normalizeText(value.currentShareId) || null,
    createdAt: normalizeTimestamp(value.createdAt),
    updatedAt: normalizeTimestamp(value.updatedAt)
  };
}

export async function listRooms({
  db,
  uid
}: {
  db: Firestore;
  uid: string;
}) {
  const snapshot = await getDocs(collection(db, "users", uid, "rooms"));

  return snapshot.docs
    .map((roomDoc) => normalizeRoom(roomDoc.data()))
    .filter((room): room is Room => room !== null)
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function createRoom({
  db,
  uid,
  name,
  description = ""
}: {
  db: Firestore;
  uid: string;
  name: string;
  description?: string;
}) {
  const timestamp = Date.now();
  const room: Room = {
    id: createRoomId(),
    name,
    description,
    currentShareId: null,
    createdAt: timestamp,
    updatedAt: timestamp
  };

  await setDoc(doc(db, "users", uid, "rooms", room.id), room);
  return room;
}

export async function updateRoom({
  db,
  uid,
  room
}: {
  db: Firestore;
  uid: string;
  room: Room;
}) {
  const nextRoom = {
    ...room,
    updatedAt: Date.now()
  };

  await setDoc(doc(db, "users", uid, "rooms", room.id), nextRoom, {
    merge: true
  });
  return nextRoom;
}

export async function updateRoomCurrentShare({
  db,
  uid,
  roomId,
  shareId
}: {
  db: Firestore;
  uid: string;
  roomId: string;
  shareId: string | null;
}) {
  await updateDoc(doc(db, "users", uid, "rooms", roomId), {
    currentShareId: shareId,
    updatedAt: Date.now()
  });
}

export async function deleteRoom({
  db,
  uid,
  roomId
}: {
  db: Firestore;
  uid: string;
  roomId: string;
}) {
  await deleteDoc(doc(db, "users", uid, "rooms", roomId));
}
