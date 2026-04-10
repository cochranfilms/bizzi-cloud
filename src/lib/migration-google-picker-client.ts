/**
 * Google Picker (Drive) — browser only. Used with OAuth scope `drive.file` so users
 * explicitly grant file/folder access before we call Drive API.
 */

export type GoogleDrivePickerMode = "import" | "browse";

export type GoogleDrivePickerDocument = {
  id: string;
  name: string;
  mimeType: string;
};

export type GoogleDrivePickerResult =
  | { type: "picked"; documents: GoogleDrivePickerDocument[] }
  | { type: "cancel" }
  | { type: "error"; message: string };

type GapiWindow = Window &
  typeof globalThis & {
    gapi?: { load: (api: string, opts: { callback: () => void }) => void };
    google?: {
      picker: {
        PickerBuilder: new () => {
          addView: (v: unknown) => unknown;
          enableFeature: (f: unknown) => unknown;
          setOAuthToken: (t: string) => unknown;
          setDeveloperKey: (k: string) => unknown;
          setCallback: (cb: (data: unknown) => void) => unknown;
          build: () => { setVisible: (v: boolean) => void };
        };
        ViewId: { DOCS: unknown };
        Response: { ACTION: string; DOCUMENTS: string };
        Action: { PICKED: string; CANCEL: string };
        Document: { ID: string; NAME: string; MIME_TYPE: string };
        Feature: { MULTISELECT_ENABLED: unknown; SUPPORT_TEAM_DRIVES: unknown };
        DocsView: new (viewId?: unknown) => {
          setIncludeFolders: (v: boolean) => unknown;
          setSelectFolderEnabled: (v: boolean) => unknown;
        };
      };
    };
  };

let pickerApiReady: Promise<void> | null = null;

function ensurePickerApiLoaded(): Promise<void> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Picker requires a browser"));
  }
  if (pickerApiReady) return pickerApiReady;
  pickerApiReady = new Promise((resolve, reject) => {
    const w = window as GapiWindow;
    const startLoad = () => {
      if (!w.gapi) {
        reject(new Error("Google API failed to load"));
        return;
      }
      w.gapi.load("picker", { callback: () => resolve() });
    };
    if (w.gapi) {
      startLoad();
      return;
    }
    const script = document.createElement("script");
    script.src = "https://apis.google.com/js/api.js";
    script.async = true;
    script.onload = startLoad;
    script.onerror = () => reject(new Error("Failed to load Google API script"));
    document.body.appendChild(script);
  });
  return pickerApiReady;
}

function mapPickerDocuments(data: unknown): GoogleDrivePickerDocument[] {
  const d = data as Record<string, unknown>;
  const g = (window as GapiWindow).google?.picker;
  if (!g) return [];
  const docsRaw = d[g.Response.DOCUMENTS];
  const docs = Array.isArray(docsRaw) ? docsRaw : docsRaw != null ? [docsRaw] : [];
  const out: GoogleDrivePickerDocument[] = [];
  for (const doc of docs) {
    const row = doc as Record<string, unknown>;
    const id = String(row[g.Document.ID] ?? "");
    const name = String(row[g.Document.NAME] ?? "");
    const mimeType = String(row[g.Document.MIME_TYPE] ?? "");
    if (id) out.push({ id, name, mimeType });
  }
  return out;
}

/**
 * @param accessToken — short-lived token from `/api/migrations/google-drive/access-token`
 * @param developerKey — Cloud Console API key with Google Picker API enabled (`NEXT_PUBLIC_*`)
 */
export async function openGoogleDrivePicker(options: {
  accessToken: string;
  developerKey: string;
  mode: GoogleDrivePickerMode;
}): Promise<GoogleDrivePickerResult> {
  const { accessToken, developerKey, mode } = options;
  if (!developerKey.trim()) {
    return { type: "error", message: "Google Picker API key is not configured." };
  }
  if (!accessToken.trim()) {
    return { type: "error", message: "Missing Google access token." };
  }

  try {
    await ensurePickerApiLoaded();
  } catch (e) {
    return { type: "error", message: e instanceof Error ? e.message : "Failed to load Picker" };
  }

  const g = (window as GapiWindow).google?.picker;
  if (!g) {
    return { type: "error", message: "Google Picker is unavailable in this browser." };
  }

  // Picker is injected by `api.js`; global `google` typings often resolve to `unknown` in CI (strict) builds.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- third-party runtime API
  const picker = g as any;

  const view = new picker.DocsView(picker.ViewId.DOCS);
  view.setIncludeFolders(true);
  view.setSelectFolderEnabled(true);

  return new Promise((resolve) => {
    const callback = (data: unknown) => {
      const row = data as Record<string, unknown>;
      const action = row[picker.Response.ACTION];
      if (action === picker.Action.PICKED) {
        const documents = mapPickerDocuments(data);
        resolve({ type: "picked", documents });
        return;
      }
      if (action === picker.Action.CANCEL) {
        resolve({ type: "cancel" });
        return;
      }
      resolve({ type: "cancel" });
    };

    let builder = new picker.PickerBuilder()
      .addView(view)
      .setOAuthToken(accessToken)
      .setDeveloperKey(developerKey.trim())
      .setCallback(callback)
      .enableFeature(picker.Feature.SUPPORT_TEAM_DRIVES);

    if (mode === "import") {
      builder = builder.enableFeature(picker.Feature.MULTISELECT_ENABLED);
    }

    builder.build().setVisible(true);
  });
}
