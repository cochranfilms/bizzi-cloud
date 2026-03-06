export interface FileEntry {
  name: string;
  relativePath: string;
  size: number;
  modifiedAt: number | null;
  file: File;
}

export async function* enumerateFiles(
  rootHandle: FileSystemDirectoryHandle,
  basePath = ""
): AsyncGenerator<FileEntry> {
  for await (const [name, handle] of rootHandle.entries()) {
    const relativePath = basePath ? `${basePath}/${name}` : name;

    if (handle.kind === "file") {
      const file = await (handle as FileSystemFileHandle).getFile();
      yield {
        name,
        relativePath,
        size: file.size,
        modifiedAt: file.lastModified,
        file,
      };
    } else if (handle.kind === "directory") {
      yield* enumerateFiles(
        handle as FileSystemDirectoryHandle,
        relativePath
      );
    }
  }
}
