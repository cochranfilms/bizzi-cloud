import type { LinkedDrive } from "@/types/backup";

export function isLinkedDriveFolderModelV2(d: LinkedDrive | undefined): boolean {
  return d?.folder_model_version === 2;
}
