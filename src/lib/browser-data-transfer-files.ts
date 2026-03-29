/**
 * Collect dropped files with directory structure using the File System Access API surface
 * (webkitGetAsEntry). Falls back to dataTransfer.files when entries are unavailable.
 */

import { fileListHasMacosPackageInteriorPaths } from "@/lib/macos-package-bundles";

function readEntriesAll(reader: FileSystemDirectoryReader): Promise<FileSystemEntry[]> {
  return new Promise((resolve, reject) => {
    const acc: FileSystemEntry[] = [];
    const read = () => {
      reader.readEntries(
        (batch) => {
          if (batch.length === 0) {
            resolve(acc);
            return;
          }
          acc.push(...batch);
          read();
        },
        (err) => reject(err)
      );
    };
    read();
  });
}

function patchRelativePath(file: File, relativePath: string): File {
  try {
    Object.defineProperty(file, "webkitRelativePath", {
      value: relativePath,
      writable: false,
      configurable: true,
    });
  } catch {
    // Some environments may ignore; uploads still use basename-only paths.
  }
  return file;
}

async function walkEntry(entry: FileSystemEntry, prefix: string, out: File[]): Promise<void> {
  if (entry.isFile) {
    const fe = entry as FileSystemFileEntry;
    await new Promise<void>((resolve, reject) => {
      fe.file(
        (file) => {
          const rel = prefix ? `${prefix}/${file.name}` : file.name;
          patchRelativePath(file, rel);
          out.push(file);
          resolve();
        },
        (err) => reject(err)
      );
    });
    return;
  }
  if (!entry.isDirectory) return;
  const de = entry as FileSystemDirectoryEntry;
  const dirPath = prefix ? `${prefix}/${de.name}` : de.name;
  const children = await readEntriesAll(de.createReader());
  for (const child of children) {
    await walkEntry(child, dirPath, out);
  }
}

/**
 * Best-effort structured file list from a drop event. Preserves paths when the OS exposes
 * directory entries (e.g. dragging a .fcpbundle onto Chrome often yields a directory tree).
 *
 * Chrome/Edge often expose every file on `dataTransfer.files` but only a subset on
 * `dataTransfer.items` / `webkitGetAsEntry` for multi-file drags from the desktop. When the
 * entry walk returns fewer files than `files`, we use `files` so the full selection is kept.
 */
export async function collectFilesFromDataTransfer(dataTransfer: DataTransfer | null): Promise<File[]> {
  if (!dataTransfer) return [];

  const fromDataTransferFiles = dataTransfer.files?.length ? Array.from(dataTransfer.files) : [];

  const items = dataTransfer.items;
  if (items && items.length > 0 && typeof items[0].webkitGetAsEntry === "function") {
    const fromEntries: File[] = [];
    try {
      for (let i = 0; i < items.length; i++) {
        const entry = items[i].webkitGetAsEntry?.();
        if (entry) {
          await walkEntry(entry, "", fromEntries);
        }
      }
      const entriesHavePackagePaths = fileListHasMacosPackageInteriorPaths(fromEntries);
      const filesHavePackagePaths = fileListHasMacosPackageInteriorPaths(fromDataTransferFiles);
      /**
       * Chrome often sets `dataTransfer.files.length` larger than the webkit entry walk (resource forks,
       * duplicates, or opaque package edges). For macOS packages (.lrlibrary, .fcpbundle, etc.), the entry
       * walk is what preserves `Something.lrlibrary/...` relative paths — prefer it when only that side
       * carries package-interior paths.
       */
      const entryWalkIsAuthoritative =
        fromEntries.length > 0 &&
        (fromDataTransferFiles.length === 0 ||
          fromEntries.length >= fromDataTransferFiles.length ||
          (entriesHavePackagePaths && !filesHavePackagePaths));
      if (entryWalkIsAuthoritative) return fromEntries;
    } catch {
      // fall through
    }
  }

  if (!fromDataTransferFiles.length) return [];
  return fromDataTransferFiles;
}
