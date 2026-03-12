/**
 * WebDAV server that proxies to Bizzi Cloud API (metadata + range).
 * Used by rclone mount to expose cloud storage as a local filesystem.
 */
import * as http from "http";
import { Readable } from "stream";

export interface MountMetadataEntry {
  id: string;
  name: string;
  path: string;
  object_key: string;
  size_bytes: number;
  modified_at: string | null;
  type: "file" | "folder";
  linked_drive_id: string;
}

export interface WebDAVServerOptions {
  apiBaseUrl: string;
  getAuthToken: () => Promise<string | null>;
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
      href = `/${toRFC3986(e.linked_drive_id)}/`;
    } else {
      const relPath = e.path || e.name;
      href = `/${toRFC3986(driveId)}/${relPath.split("/").map(toRFC3986).join("/")}${isDir ? "/" : ""}`;
    }

    const lastmod = e.modified_at ? `<d:getlastmodified>${escapeXml(new Date(e.modified_at).toUTCString())}</d:getlastmodified>` : "";
    const size = !isDir ? `<d:getcontentlength>${e.size_bytes}</d:getcontentlength>` : "";
    const contentType = !isDir ? `<d:getcontenttype>application/octet-stream</d:getcontenttype>` : "";

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
          console.error("WebDAV error:", err);
          res.writeHead(500, { "Content-Type": "text/plain" });
          res.end("Internal Server Error");
        }
      });

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
    console.log(`[WebDAV] ${req.method} ${url.pathname} -> pathname="${pathname}" parts=[${parts.join(", ")}] auth=${token ? "OK" : "MISSING"}`);

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

    if (req.method === "OPTIONS") {
      res.writeHead(200, {
        Allow: "OPTIONS, PROPFIND, GET, HEAD",
        "DAV": "1, 2",
      });
      res.end();
      return;
    }

    res.writeHead(405, { Allow: "OPTIONS, PROPFIND, GET, HEAD" });
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
    } catch (err) {
      console.error("[WebDAV] PROPFIND error:", err);
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
    fetchRes.headers.forEach((v, k) => {
      const lower = k.toLowerCase();
      if (["content-length", "content-range", "accept-ranges"].includes(lower)) {
        resHeaders[k] = v;
      }
    });

    res.writeHead(fetchRes.status as 200 | 206, resHeaders);
    if (req.method === "GET" && fetchRes.body) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      Readable.fromWeb(fetchRes.body as any).pipe(res);
    } else {
      res.end();
    }
  }

  private async fetchMetadata(
    token: string,
    driveId: string | null,
    paths: string[]
  ): Promise<{ entries: MountMetadataEntry[] }> {
    const res = await fetch(`${this.options.apiBaseUrl}/api/mount/metadata`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ drive_id: driveId, paths }),
    });

    if (!res.ok) {
      throw new Error(`Metadata API error: ${res.status}`);
    }
    return res.json();
  }
}
