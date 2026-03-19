import { PassThrough, Readable } from "stream";
import archiver from "archiver";
import { getObject } from "@/lib/b2";

/** Deduplicates filenames for zip (e.g. image.jpg, image (1).jpg). */
function uniqueZipNames(names: string[]): string[] {
  const used = new Map<string, number>();
  return names.map((raw) => {
    const base = raw.replace(/\.([^.]+)$/, "");
    const ext = raw.includes(".") ? raw.slice(raw.lastIndexOf(".")) : "";
    let name = raw;
    let n = 0;
    while (used.has(name)) {
      n++;
      name = `${base} (${n})${ext}`;
    }
    used.set(name, 1);
    return name;
  });
}

/**
 * Creates a streaming ZIP response from B2 object keys.
 * Starts the async stream population in the background.
 */
export function createZipStream(
  items: { object_key: string; name: string }[],
  logPrefix: string = "zip"
): ReadableStream<Uint8Array> {
  const names = uniqueZipNames(items.map((i) => i.name));
  const archive = archiver("zip", { zlib: { level: 0 } });
  archive.on("error", (err) => {
    console.error(`[${logPrefix}] Archive error:`, err);
  });

  const passThrough = new PassThrough();
  archive.pipe(passThrough);

  void (async () => {
    try {
      for (let i = 0; i < items.length; i++) {
        const { object_key } = items[i];
        const name = names[i];
        const { body: objBody } = await getObject(object_key);
        const nodeStream =
          typeof (objBody as { getReader?: unknown }).getReader === "function"
            ? Readable.fromWeb(objBody as ReadableStream)
            : (objBody as NodeJS.ReadableStream);
        archive.append(nodeStream as NodeJS.ReadableStream, { name });
      }
      await archive.finalize();
    } catch (err) {
      console.error(`[${logPrefix}] Error:`, err);
      archive.emit("error", err);
    }
  })();

  return Readable.toWeb(passThrough) as ReadableStream<Uint8Array>;
}

/** Returns a Response that streams a ZIP of B2 objects. */
export function streamZipFromB2(
  items: { object_key: string; name: string }[],
  logPrefix = "gallery download-bulk-zip"
): Response {
  return new Response(createZipStream(items, logPrefix), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": 'attachment; filename="download.zip"',
    },
  });
}
