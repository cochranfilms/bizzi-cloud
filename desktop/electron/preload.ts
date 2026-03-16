import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("bizzi", {
  getSettings: () => ipcRenderer.invoke("get-settings"),
  setSettings: (key: string, value: unknown) =>
    ipcRenderer.invoke("set-settings", key, value),
  getPath: (name: "userData" | "cacheBase") =>
    ipcRenderer.invoke("get-path", name),
  openInFinder: (pathToOpen: string) =>
    ipcRenderer.invoke("open-in-finder", pathToOpen),
  openExternal: (url: string) => ipcRenderer.invoke("open-external", url),
  mount: {
    isFuseAvailable: () => ipcRenderer.invoke("mount-fuse-available"),
    getDependencies: () => ipcRenderer.invoke("mount-dependencies"),
    getStatus: () => ipcRenderer.invoke("mount-status"),
    mount: (apiBaseUrl: string, token: string) =>
      ipcRenderer.invoke("mount-mount", { apiBaseUrl, token }),
    unmount: () => ipcRenderer.invoke("mount-unmount"),
    refreshToken: (token: string) => ipcRenderer.invoke("mount-refresh-token", token),
    refreshFolder: (driveSlug: string) => ipcRenderer.invoke("mount-refresh-folder", driveSlug),
  },
  nativeSync: {
    isAvailable: () => ipcRenderer.invoke("native-sync-available"),
    getStatus: () => ipcRenderer.invoke("native-sync-status"),
    enable: (apiBaseUrl: string, token: string) =>
      ipcRenderer.invoke("native-sync-enable", { apiBaseUrl, token }),
    disable: () => ipcRenderer.invoke("native-sync-disable"),
    refreshToken: (token: string) => ipcRenderer.invoke("native-sync-refresh-token", token),
  },
});
