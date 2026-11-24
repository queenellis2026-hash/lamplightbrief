import { addDoc, collection, getDocs, orderBy, query, serverTimestamp } from "firebase/firestore";
import { ensureAnonymousUser, getDb } from "./firebase";

// Briefs are saved to Firestore under the user's anonymous-auth uid.
// Only the finished brief text and its audit score are stored — the
// privacy scan runs on-device first, and the deep audit only ever
// receives redacted text.

export interface SavedBrief {
  id: string;
  briefText: string;
  auditScore: number | null;
  createdAt: string;
}

export async function saveBrief(briefText: string, auditScore: number | null): Promise<void> {
  const db = getDb();
  const uid = await ensureAnonymousUser();
  if (!db || !uid) throw new Error("Firebase is not configured yet.");
  await addDoc(collection(db, "users", uid, "briefs"), {
    briefText,
    auditScore,
    createdAt: serverTimestamp(),
  });
}

export async function listBriefs(): Promise<SavedBrief[]> {
  const db = getDb();
  const uid = await ensureAnonymousUser();
  if (!db || !uid) return [];
  const q = query(collection(db, "users", uid, "briefs"), orderBy("createdAt", "desc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      briefText: String(data.briefText ?? ""),
      auditScore: (data.auditScore as number | null) ?? null,
      createdAt: data.createdAt?.toDate?.()?.toLocaleString?.() ?? "",
    };
  });
}
