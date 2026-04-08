/**
 * WebDAV server that proxies to Bizzi Cloud API (metadata + range).
 * Used by Native Sync (Apple File Provider) over a loopback WebDAV URL.
 */
import * as fs from "fs";
import * as http from "http";
import { tmpdir } from "os";
import { join } from "path";
import { pipeline } from "stream";
import { promisify } from "util";
import { Readable } from "stream";
import { desktopLog } from "../logger";

const pipelineP = promisify(pipeline);

/** PUT bodies above this threshold are buffered to temp file first to avoid
 * "Controller is already closed" race when rclone/NLE disconnects mid-upload. */
const LARGE_PUT_THRESHOLD_BYTES = 50 * 1024 * 1024; // 50 MB
const API_FETCH_TIMEOUT_MS = 30000; // Production API can be slow (cold start, Firestore)
const API_FETCH_RETRY_DELAY_MS = 1500;

export interface MountMetadataEntry {
  id: string;
  name: string;
  path: string;
  object_key: string;
  size_bytes: number;
  modified_at: string | null;
  type: "file" | "folder";
  linked_drive_id: string;
  content_type?: string | null;
  /** ETag from object_key; changes when conform switches proxy→original so rclone invalidates cache */
  etag?: string | null;
}

export interface WebDAVServerOptions {
  apiBaseUrl: string;
  getAuthToken: () => Promise<string | null>;
  /** Optional range cache; when provided, handleGet checks cache before API fetch. */
  prefetchCache?: {
    get(objectKey: string, rangeStart: number, rangeEnd: number | null): Promise<Buffer | null>;
  };
  /** Called when a file is successfully uploaded via PUT. Used for notification. */
  onUploadComplete?: (fileName: string) => void;
  /** Predictive prefetch: called after folder is listed (driveId, folderPath, entries). */
  onFolderListed?: (driveId: string | null, folderPath: string, entries: MountMetadataEntry[]) => void;
  /** Predictive prefetch: called when file is read (driveId, relativePath, rangeStart, rangeEnd). */
  onFileRead?: (driveId: string, relativePath: string, rangeStart: number, rangeEnd: number | null) => void;
}

const XML_HEADER = '<?xml version="1.0" encoding="utf-8"?>';
const DAV_NS = "DAV:";

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function toRFC3986(pathSegment: string): string {
  return pathSegment
    .split("/")
    .map((p) => encodeURIComponent(p).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`))
    .join("/");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableFetchError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return (
    message.includes("fetch failed") ||
    message.includes("Connect Timeout Error") ||
    message.includes("UND_ERR_CONNECT_TIMEOUT") ||
    message.includes("ECONNRESET") ||
    message.includes("ETIMEDOUT") ||
    message.includes("timed out") ||
    message.includes("aborted")
  );
}

/** MIME type from content_type or filename extension. Finder uses this for correct file icons. */
function getContentType(entry: { name: string; content_type?: string | null }): string {
  if (entry.content_type && /^[a-zA-Z0-9.-]+\/[a-zA-Z0-9.-]+$/.test(entry.content_type)) {
    return entry.content_type;
  }
  const ext = entry.name.split(".").pop()?.toLowerCase() ?? "";
  const mime: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    gif: "image/gif",
    webp: "image/webp",
    heic: "image/heic",
    tiff: "image/tiff",
    tif: "image/tiff",
    psd: "image/vnd.adobe.photoshop",
    mov: "video/quicktime",
    mp4: "video/mp4",
    m4v: "video/x-m4v",
    arw: "image/x-sony-arw",
    cr2: "image/x-canon-cr2",
    pdf: "application/pdf",
    // NLE project files
    prproj: "application/x-adobe-premiere-project",
    premiereproject: "application/x-adobe-premiere-project",
    fcpxml: "application/xml",
    fcpbundle: "application/octet-stream",
    fcpproject: "application/octet-stream",
    fcpevent: "application/octet-stream",
    drp: "application/x-davinci-resolve-project",
    dra: "application/octet-stream",
    drt: "application/octet-stream",
    aep: "application/x-adobe-after-effects",
    mogrt: "application/octet-stream",
    lrlibrary: "application/octet-stream",
    lrcat: "application/octet-stream",
    lrdata: "application/octet-stream",
    otio: "application/json",
    edl: "text/plain",
    aaf: "application/octet-stream",
    srt: "text/plain",
    vtt: "text/vtt",
    cube: "application/octet-stream",
    cdl: "application/xml",
    ale: "text/plain",
  };
  return mime[ext] ?? "application/octet-stream";
}

function buildPropfindResponse(
  entries: MountMetadataEntry[],
  driveId: string | null,
  options: { includeRoot?: boolean; rootHref?: string; rootDisplayName?: string }
): string {
  const responses: string[] = [];

  // Apple File Provider expects the requested resource as the first response (RFC 4918 Depth: 1).
  // Without this, Finder stays stuck on "Loading...".
  if (options.includeRoot) {
    const href = options.rootHref ?? "/";
    const displayName = options.rootDisplayName ?? "Bizzi Cloud";
    responses.push(`
    <d:response>
      <d:href>${escapeXml(href)}</d:href>
      <d:propstat>
        <d:prop>
          <d:resourcetype><d:collection/></d:resourcetype>
          <d:displayname>${escapeXml(displayName)}</d:displayname>
        </d:prop>
        <d:status>HTTP/1.1 200 OK</d:status>
      </d:propstat>
    </d:response>`);
  }

  for (const e of entries) {
    const isDir = e.type === "folder";
    let href: string;
    if (!driveId) {
      // Use human-readable path so Finder/rclone show "Storage", "RAW", "Gallery Media"
      const pathSegment =
        e.name === "Storage" || e.name === "RAW" || e.name === "Gallery Media"
          ? e.name
          : e.linked_drive_id;
      href = `/${toRFC3986(pathSegment)}/`;
    } else {
      const relPath = e.path || e.name;
      href = `/${toRFC3986(driveId)}/${relPath.split("/").map(toRFC3986).join("/")}${isDir ? "/" : ""}`;
    }

    const lastmod = e.modified_at ? `<d:getlastmodified>${escapeXml(new Date(e.modified_at).toUTCString())}</d:getlastmodified>` : "";
    const size = !isDir ? `<d:getcontentlength>${e.size_bytes}</d:getcontentlength>` : "";
    const mime = !isDir ? escapeXml(getContentType(e)) : "";
    const contentType = !isDir ? `<d:getcontenttype>${mime}</d:getcontenttype>` : "";
    const etag = !isDir && e.etag ? `<d:getetag>${escapeXml(e.etag)}</d:getetag>` : "";

    responses.push(`
    <d:response>
      <d:href>${escapeXml(href)}</d:href>
      <d:propstat>
        <d:prop>
          <d:resourcetype>${isDir ? "<d:collection/>" : ""}</d:resourcetype>
          <d:displayname>${escapeXml(e.name)}</d:displayname>
          ${lastmod}
          ${size}
          ${contentType}
          ${etag}
        </d:prop>
        <d:status>HTTP/1.1 200 OK</d:status>
      </d:propstat>
    </d:response>`);
  }

  return `${XML_HEADER}
<d:multistatus xmlns:d="${DAV_NS}">${responses.join("")}
</d:multistatus>`;
}

export class WebDAVServer {
  private server: http.Server | null = null;
  private port: number = 0;

  constructor(private options: WebDAVServerOptions) {}

  async start(): Promise<number> {
    return new Promise((resolve, reject) => {
      this.server = http.createServer(async (req, res) => {
        try {
          await this.handleRequest(req, res);
        } catch (err) {
          desktopLog.error("WebDAV error:", err);
          res.writeHead(500, { "Content-Type": "text/plain" });
          res.end("Internal Server Error");
        }
      });

      // Long uploads (video exports) can exceed Node's default 5min requestTimeout.
      // Disable requestTimeout so PUT requests aren't aborted mid-stream.
      this.server.requestTimeout = 0;
      this.server.headersTimeout = 120000; // 2 min for slow clients

      this.server.listen(0, "127.0.0.1", () => {
        const addr = this.server?.address();
        this.port = addr && typeof addr === "object" ? addr.port : 0;
        resolve(this.port);
      });

      this.server.on("error", reject);
    });
  }

  getPort(): number {
    return this.port;
  }

  getUrl(): string {
    return `http://127.0.0.1:${this.port}`;
  }

  stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => resolve());
        this.server = null;
      } else {
        resolve();
      }
    });
  }

  private async fetchApi(input: string, init: RequestInit, options?: { timeoutMs?: number; retries?: number }): Promise<Response> {
    const timeoutMs = options?.timeoutMs ?? API_FETCH_TIMEOUT_MS;
    const retries = options?.retries ?? 1;
    let lastError: unknown;

    for (let attempt = 0; attempt <= retries; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(new Error(`API request timed out after ${timeoutMs}ms`)), timeoutMs);
      try {
        const response = await fetch(input, {
          ...init,
          signal: controller.signal,
        });
        clearTimeout(timer);
        return response;
      } catch (err) {
        clearTimeout(timer);
        lastError = err;
        const shouldRetry = attempt < retries && isRetryableFetchError(err);
        if (!shouldRetry) throw err;
        desktopLog.warn("[WebDAV] API fetch retrying", { url: input, attempt: attempt + 1, timeoutMs, err });
        await sleep(API_FETCH_RETRY_DELAY_MS);
      }
    }

    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  }

  private async getToken(req: http.IncomingMessage): Promise<string | null> {
    const auth = req.headers.authorization;
    if (!auth) return null;

    // Bearer token (rclone, token refresh flow)
    if (auth.startsWith("Bearer ")) {
      return this.options.getAuthToken();
    }

    // Basic auth (File Provider / WebDAV clients: user="bizzi", password=token)
    if (auth.startsWith("Basic ")) {
      try {
        const base64 = auth.slice(6).trim();
        const decoded = Buffer.from(base64, "base64").toString("utf-8");
        const colon = decoded.indexOf(":");
        const user = colon >= 0 ? decoded.slice(0, colon) : decoded;
        const password = colon >= 0 ? decoded.slice(colon + 1) : "";
        if (user === "bizzi" && password) return password;
      } catch {
        // ignore malformed Basic
      }
    }
    return null;
  }

  private async handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const token = await this.getToken(req);
    const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
    let pathname = decodeURIComponent(url.pathname).replace(/\/+/g, "/").replace(/^\//, "").replace(/\/$/, "") || "";
    // Some File Provider clients use /webdav/ prefix (see electron-macos-file-provider README)
    if (pathname.startsWith("webdav/")) pathname = pathname.slice(7);
    else if (pathname === "webdav") pathname = "";
    const parts = pathname ? pathname.split("/") : [];

    // Debug: log all requests (run app from terminal to see)
    desktopLog.info(`[WebDAV] ${req.method} ${url.pathname} -> pathname="${pathname}" parts=[${parts.join(", ")}] auth=${token ? "OK" : "MISSING"}`);

    if (!token) {
      res.writeHead(401, { "WWW-Authenticate": 'Bearer realm="Bizzi Cloud"' });
      res.end();
      return;
    }

    if (req.method === "PROPFIND") {
      await this.handlePropfind(res, parts, token);
      return;
    }

    if (req.method === "GET" || req.method === "HEAD") {
      await this.handleGet(req, res, parts, token);
      return;
    }

    if (req.method === "PUT") {
      await this.handlePut(req, res, parts, token);
      return;
    }

    if (req.method === "MOVE") {
      await this.handleMove(req, res, parts, token);
      return;
    }

    if (req.method === "MKCOL") {
      await this.handleMkcol(res, parts, token);
      return;
    }

    if (req.method === "DELETE") {
      await this.handleDelete(res, parts, token);
      return;
    }

    if (req.method === "OPTIONS") {
      res.writeHead(200, {
        Allow: "OPTIONS, PROPFIND, GET, HEAD, PUT, MOVE, MKCOL, DELETE",
        "DAV": "1, 2",
      });
      res.end();
      return;
    }

    res.writeHead(405, { Allow: "OPTIONS, PROPFIND, GET, HEAD, PUT, MOVE, MKCOL, DELETE" });
    res.end();
  }

  private async handlePropfind(
    res: http.ServerResponse,
    parts: string[],
    token: string
  ): Promise<void> {
    let entries: MountMetadataEntry[];
    try {
    if (parts.length === 0) {
      const meta = await this.fetchMetadata(token, null, []);
      entries = meta.entries;
    } else {
      const driveId = parts[0];
      const path = parts.slice(1).join("/");
      const meta = await this.fetchMetadata(token, driveId, [path || ""]);
      entries = meta.entries;
    }

    const driveId = parts[0] ?? null;
    const isRoot = parts.length === 0;
    const options = isRoot
      ? { includeRoot: true, rootHref: "/", rootDisplayName: "Bizzi Cloud" }
      : {
          includeRoot: true,
          rootHref: `/${driveId}${parts.length > 1 ? `/${parts.slice(1).map(toRFC3986).join("/")}` : ""}/`,
          rootDisplayName: parts.length > 1 ? (entries[0]?.name ?? "Folder") : (entries.find((e) => e.linked_drive_id === driveId)?.name ?? "Drive"),
        };
    const xml = buildPropfindResponse(entries, driveId, options);
    res.writeHead(207, {
      "Content-Type": "application/xml; charset=utf-8",
      "DAV": "1, 2",
    });
    res.end(xml);
    // Predictive prefetch: folder opened → pre-cache first 30s of every clip
    if (parts.length >= 1) {
      const folderPath = parts.slice(1).join("/");
      this.options.onFolderListed?.(driveId, folderPath, entries);
    }
    } catch (err) {
      desktopLog.error("[WebDAV] PROPFIND error:", err);
      res.writeHead(500, { "Content-Type": "text/plain" });
      res.end("Internal Server Error");
    }
  }

  private async handleGet(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    parts: string[],
    token: string
  ): Promise<void> {
    if (parts.length < 2) {
      res.writeHead(400);
      res.end();
      return;
    }

    const driveId = parts[0];
    const fileName = parts[parts.length - 1];

    const parentPath = parts.length > 2 ? parts.slice(1, -1).join("/") : "";
    const meta = await this.fetchMetadata(token, driveId, [parentPath]);
    const entry = meta.entries.find((e) => e.path === (parentPath ? `${parentPath}/${fileName}` : fileName) && e.type === "file");

    if (!entry?.object_key) {
      res.writeHead(404);
      res.end();
      return;
    }

    const rangeHeader = req.headers.range;
    let rangeStart = 0;
    let rangeEnd: number | null = null;
    if (rangeHeader) {
      const m = rangeHeader.match(/bytes=(\d+)-(\d*)/);
      if (m) {
        rangeStart = parseInt(m[1], 10);
        rangeEnd = m[2] ? parseInt(m[2], 10) : null;
      }
    }
    const effectiveRangeEnd = rangeEnd ?? entry.size_bytes - 1;

    const relativePath = parentPath ? `${parentPath}/${fileName}` : fileName;
    this.options.onFileRead?.(driveId, relativePath, rangeStart, rangeEnd);

    // Check prefetch cache before API
    const cached = await this.options.prefetchCache?.get(entry.object_key, rangeStart, effectiveRangeEnd);
    if (cached && cached.length > 0) {
      const resHeaders: Record<string, string> = {
        "Content-Type": "application/octet-stream",
        "Content-Length": String(cached.length),
      };
      if (entry.etag) resHeaders.ETag = entry.etag;
      if (entry.modified_at) resHeaders["Last-Modified"] = new Date(entry.modified_at).toUTCString();
      resHeaders["Content-Range"] = `bytes ${rangeStart}-${rangeStart + cached.length - 1}/${entry.size_bytes}`;
      res.writeHead(206, resHeaders);
      res.end(cached);
      return;
    }

    const rangeUrl = `${this.options.apiBaseUrl}/api/mount/range?object_key=${encodeURIComponent(entry.object_key)}`;
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
    };
    if (rangeHeader) headers.Range = rangeHeader;

    const fetchRes = await fetch(rangeUrl, { headers });
    if (!fetchRes.ok) {
      res.writeHead(fetchRes.status);
      res.end();
      return;
    }

    const resHeaders: Record<string, string> = {
      "Content-Type": "application/octet-stream",
    };
    if (entry.etag) resHeaders.ETag = entry.etag;
    if (entry.modified_at) resHeaders["Last-Modified"] = new Date(entry.modified_at).toUTCString();
    fetchRes.headers.forEach((v, k) => {
      const lower = k.toLowerCase();
      if (["content-length", "content-range", "accept-ranges"].includes(lower)) {
        resHeaders[k] = v;
      }
    });

    res.writeHead(fetchRes.status as 200 | 206, resHeaders);
    if (req.method === "GET" && fetchRes.body) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const readable = Readable.fromWeb(fetchRes.body as any);
      req.on("close", () => readable.destroy());
      pipelineP(readable, res).catch((err) => {
        if (!res.writableEnded) {
          try {
            res.destroy(err instanceof Error ? err : undefined);
          } catch {
            /* ignore */
          }
        }
      });
    } else {
      res.end();
    }
  }

  private async handlePut(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    parts: string[],
    token: string
  ): Promise<void> {
    if (parts.length < 2) {
      res.writeHead(400);
      res.end();
      return;
    }

    const driveId = parts[0];
    const fileName = parts[parts.length - 1];
    const parentPath = parts.length > 2 ? parts.slice(1, -1).join("/") : "";
    const relativePath = parentPath ? `${parentPath}/${fileName}` : fileName;
    const contentLength = req.headers["content-length"];
    const sizeBytes = contentLength ? parseInt(contentLength, 10) : 0;
    const contentType = (req.headers["content-type"] as string) ?? "application/octet-stream";

    if (isNaN(sizeBytes) || sizeBytes < 0) {
      res.writeHead(400);
      res.end("Content-Length required");
      return;
    }

    try {
      // 1. Get presigned upload URL
      const urlRes = await fetch(`${this.options.apiBaseUrl}/api/backup/upload-url`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          drive_id: driveId,
          relative_path: relativePath,
          content_type: contentType,
          size_bytes: sizeBytes,
        }),
      });
      if (!urlRes.ok) {
        const err = await urlRes.json().catch(() => ({}));
        desktopLog.error("[WebDAV] upload-url error:", urlRes.status, err);
        res.writeHead(urlRes.status === 503 ? 503 : 400);
        res.end(err?.error ?? "Failed to get upload URL");
        return;
      }

      const urlData = (await urlRes.json()) as {
        uploadUrl?: string;
        objectKey?: string;
        alreadyExists?: boolean;
      };
      if (urlData.alreadyExists && urlData.objectKey) {
        // File already exists (content-hash dedup) - still create backup_files record
        const completeRes = await fetch(`${this.options.apiBaseUrl}/api/mount/upload-complete`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            drive_id: driveId,
            relative_path: relativePath,
            object_key: urlData.objectKey,
            size_bytes: sizeBytes,
            content_type: contentType,
          }),
        });
        if (!completeRes.ok) {
          const err = await completeRes.json().catch(() => ({}));
          res.writeHead(completeRes.status);
          res.end(err?.error ?? "Failed to create file record");
          return;
        }
        this.options.onUploadComplete?.(fileName);
        res.writeHead(201);
        res.end();
        return;
      }

      if (!urlData.uploadUrl || !urlData.objectKey) {
        res.writeHead(500);
        res.end("Invalid upload URL response");
        return;
      }

      // 2. Stream request body to B2
      // For large uploads (NLE exports), buffer to temp file first to avoid "Controller is already closed"
      // race when Readable.toWeb(req) stream closes mid-transfer.
      const putHeaders: Record<string, string> = {
        "Content-Type": contentType,
        "x-amz-server-side-encryption": "AES256",
      };
      if (sizeBytes > 0) putHeaders["Content-Length"] = String(sizeBytes);

      let uploadRes: Response;
      if (sizeBytes >= LARGE_PUT_THRESHOLD_BYTES && req.readable) {
        const tmpPath = join(tmpdir(), `put-${Date.now()}-${Math.random().toString(36).slice(2)}`);
        const writeStream = fs.createWriteStream(tmpPath);
        await pipelineP(req, writeStream);
        const fileStream = fs.createReadStream(tmpPath);
        try {
          uploadRes = await fetch(urlData.uploadUrl, {
            method: "PUT",
            headers: putHeaders,
            body: Readable.toWeb(fileStream) as BodyInit,
            duplex: "half",
          } as unknown as RequestInit);
        } finally {
          fileStream.destroy();
          fs.unlink(tmpPath, () => {});
        }
      } else {
        const putInit = {
          method: "PUT" as const,
          headers: putHeaders,
          body: req.readable ? (Readable.toWeb(req) as BodyInit) : new ArrayBuffer(0),
          duplex: "half",
        };
        uploadRes = await fetch(urlData.uploadUrl, putInit as unknown as RequestInit);
      }

      if (!uploadRes.ok) {
        desktopLog.error("[WebDAV] B2 upload error:", uploadRes.status, await uploadRes.text());
        res.writeHead(502);
        res.end("Upload to storage failed");
        return;
      }

      // 3. Create backup_files record
      const completeRes = await fetch(`${this.options.apiBaseUrl}/api/mount/upload-complete`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          drive_id: driveId,
          relative_path: relativePath,
          object_key: urlData.objectKey,
          size_bytes: sizeBytes,
          content_type: contentType,
        }),
      });

      if (!completeRes.ok) {
        const err = await completeRes.json().catch(() => ({}));
        desktopLog.error("[WebDAV] upload-complete error:", completeRes.status, err);
        res.writeHead(completeRes.status);
        res.end(err?.error ?? "Upload completed but failed to create file record");
        return;
      }

      this.options.onUploadComplete?.(fileName);
      res.writeHead(201);
      res.end();
    } catch (err) {
      desktopLog.error("[WebDAV] PUT error:", err);
      res.writeHead(500);
      res.end("Internal Server Error");
    }
  }

  /** MOVE = rename file/folder. Updates backup_files.relative_path via mount rename API. */
  private async handleMove(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    parts: string[],
    token: string
  ): Promise<void> {
    const destHeader = req.headers.destination;
    const destStr = typeof destHeader === "string" ? destHeader : Array.isArray(destHeader) ? destHeader[0] : undefined;
    if (!destStr || parts.length < 2) {
      res.writeHead(400);
      res.end();
      return;
    }
    try {
      const destUrl = new URL(destStr);
      const destPath = decodeURIComponent(destUrl.pathname)
        .replace(/\/+/g, "/")
        .replace(/^\//, "")
        .replace(/\/$/, "")
        .replace(/^webdav\/?/, "");
      const destParts = destPath ? destPath.split("/") : [];
      if (destParts.length < 2) {
        res.writeHead(400);
        res.end();
        return;
      }
      const srcDriveId = parts[0];
      const srcPath = parts.slice(1).join("/");
      const destDriveId = destParts[0];
      const destPathRel = destParts.slice(1).join("/");
      if (srcDriveId !== destDriveId) {
        res.writeHead(502);
        res.end("Cross-drive move not yet supported");
        return;
      }
      const renameRes = await fetch(`${this.options.apiBaseUrl}/api/mount/rename`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          drive_id: srcDriveId,
          old_path: srcPath,
          new_path: destPathRel,
        }),
      });
      if (!renameRes.ok) {
        const err = await renameRes.json().catch(() => ({}));
        desktopLog.error("[WebDAV] rename error:", renameRes.status, err);
        res.writeHead(renameRes.status === 404 ? 404 : 502);
        res.end(err?.error ?? "Rename failed");
        return;
      }
      res.writeHead(201);
      res.end();
    } catch (err) {
      desktopLog.error("[WebDAV] MOVE error:", err);
      res.writeHead(500);
      res.end("Internal Server Error");
    }
  }

  /** MKCOL = create directory. Reject file-like paths to avoid rclone "is a directory not a file" when NLEs create temp dirs. */
  private static readonly FILE_LIKE_EXT = /\.(mp4|mov|mxf|avi|mkv|mp3|wav|dng|braw|r3d|ari|crm|psd|pdf|zip)$/i;

  private async handleMkcol(
    res: http.ServerResponse,
    parts: string[],
    token: string
  ): Promise<void> {
    if (parts.length < 1) {
      res.writeHead(400);
      res.end();
      return;
    }
    const lastSegment = parts[parts.length - 1];
    if (WebDAVServer.FILE_LIKE_EXT.test(lastSegment)) {
      desktopLog.warn("[WebDAV] MKCOL rejected on file-like path", { path: parts.join("/") });
      res.writeHead(409);
      res.end("Conflict: path looks like a file, not a directory");
      return;
    }
    res.writeHead(201);
    res.end();
  }

  /** DELETE = soft-delete file or folder. Moves to trash via mount delete API. */
  private async handleDelete(
    res: http.ServerResponse,
    parts: string[],
    token: string
  ): Promise<void> {
    if (parts.length < 2) {
      res.writeHead(400);
      res.end();
      return;
    }
    const driveId = parts[0];
    const relativePath = parts.slice(1).join("/");
    try {
      const deleteRes = await fetch(`${this.options.apiBaseUrl}/api/mount/delete`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ drive_id: driveId, path: relativePath }),
      });
      if (!deleteRes.ok) {
        const err = await deleteRes.json().catch(() => ({}));
        desktopLog.error("[WebDAV] delete error:", deleteRes.status, err);
        res.writeHead(deleteRes.status === 404 ? 404 : 502);
        res.end(err?.error ?? "Delete failed");
        return;
      }
      res.writeHead(204);
      res.end();
    } catch (err) {
      desktopLog.error("[WebDAV] DELETE error:", err);
      res.writeHead(500);
      res.end("Internal Server Error");
    }
  }

  private async fetchMetadata(
    token: string,
    driveId: string | null,
    paths: string[]
  ): Promise<{ entries: MountMetadataEntry[] }> {
    const res = await this.fetchApi(`${this.options.apiBaseUrl}/api/mount/metadata`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ drive_id: driveId, paths }),
    }, { timeoutMs: API_FETCH_TIMEOUT_MS, retries: 3 });

    if (!res.ok) {
      throw new Error(`Metadata API error: ${res.status}`);
    }
    return res.json();
  }
}
