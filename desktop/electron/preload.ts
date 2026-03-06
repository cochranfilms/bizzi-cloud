import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("bizzi", {
  getSettings: () => ipcRenderer.invoke("get-settings"),
  setSettings: (key: string, value: unknown) =>
    ipcRenderer.invoke("set-settings", key, value),
  getPath: (name: "userData" | "cacheBase") =>
    ipcRenderer.invoke("get-path", name),
});
