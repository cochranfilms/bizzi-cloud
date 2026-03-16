/**
 * Project Rendition State - V3 Smart Rendition Switching
 *
 * Stores which rendition (proxy vs original) the mount layer should serve for each drive/project.
 * Edit mode = proxy (default). Conform mode = original.
 * Same logical path resolves to different bytes based on this state.
 */

import { getAdminFirestore } from "@/lib/firebase-admin";

const COLLECTION = "project_rendition_state";

export type PreferredRendition = "proxy" | "original";

export interface ProjectRenditionStateDoc {
  projectId: string; // linked_drive_id
  userId: string;
  preferredRendition: PreferredRendition;
  lastConformSessionId: string | null;
  updatedAt: string;
}

export async function getProjectRenditionState(
  userId: string,
  driveIds: string[]
): Promise<Map<string, PreferredRendition>> {
  if (driveIds.length === 0) return new Map();

  const db = getAdminFirestore();
  const result = new Map<string, PreferredRendition>();

  const snap = await db
    .collection(COLLECTION)
    .where("userId", "==", userId)
    .where("projectId", "in", driveIds.slice(0, 10)) // Firestore 'in' limit 10
    .get();

  for (const doc of snap.docs) {
    const data = doc.data() as ProjectRenditionStateDoc;
    result.set(data.projectId, data.preferredRendition);
  }

  // If more than 10 drives, batch
  for (let i = 10; i < driveIds.length; i += 10) {
    const batch = driveIds.slice(i, i + 10);
    const batchSnap = await db
      .collection(COLLECTION)
      .where("userId", "==", userId)
      .where("projectId", "in", batch)
      .get();
    for (const doc of batchSnap.docs) {
      const data = doc.data() as ProjectRenditionStateDoc;
      result.set(data.projectId, data.preferredRendition);
    }
  }

  return result;
}

export async function setProjectRenditionState(
  userId: string,
  projectId: string,
  preferredRendition: PreferredRendition,
  lastConformSessionId?: string | null
): Promise<void> {
  const db = getAdminFirestore();
  const now = new Date().toISOString();
  const docId = `${userId}:${projectId}`;

  await db.collection(COLLECTION).doc(docId).set(
    {
      projectId,
      userId,
      preferredRendition,
      lastConformSessionId: lastConformSessionId ?? null,
      updatedAt: now,
    },
    { merge: true }
  );
}
