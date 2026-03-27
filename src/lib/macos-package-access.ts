import type { DocumentData } from "firebase-admin/firestore";
import { getAdminFirestore } from "@/lib/firebase-admin";
import { verifyBackupFileAccessWithGalleryFallback } from "@/lib/backup-access";
import { MACOS_PACKAGE_CONTAINERS_COLLECTION } from "@/lib/macos-package-container-admin";
import { BACKUP_LIFECYCLE_ACTIVE } from "@/lib/backup-file-lifecycle";

export async function verifyMacosPackageAccessForUser(
  uid: string,
  packageId: string
): Promise<
  | { ok: true; containerId: string; data: DocumentData }
  | { ok: false; status: number; message: string }
> {
  const db = getAdminFirestore();
  const cref = db.collection(MACOS_PACKAGE_CONTAINERS_COLLECTION).doc(packageId);
  const cs = await cref.get();
  if (!cs.exists) {
    return { ok: false, status: 404, message: "Package not found" };
  }
  const member = await db
    .collection("backup_files")
    .where("macos_package_id", "==", packageId)
    .where("lifecycle_state", "==", BACKUP_LIFECYCLE_ACTIVE)
    .limit(1)
    .get();
  if (member.empty) {
    return { ok: false, status: 404, message: "Package has no active files" };
  }
  const objectKey = member.docs[0].data().object_key as string;
  const allowed = await verifyBackupFileAccessWithGalleryFallback(uid, objectKey);
  if (!allowed) {
    return { ok: false, status: 403, message: "Access denied" };
  }
  return { ok: true, containerId: packageId, data: cs.data()! };
}
