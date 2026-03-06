import { useEffect, useState } from "react";
import { MountPanel } from "./components/MountPanel";
import { LocalStorePanel } from "./components/LocalStorePanel";
import { StreamCachePanel } from "./components/StreamCachePanel";

declare global {
  interface Window {
    bizzi?: {
      getSettings: () => Promise<Record<string, unknown>>;
      setSettings: (key: string, value: unknown) => Promise<Record<string, unknown>>;
      getPath: (name: "userData" | "cacheBase") => Promise<string>;
    };
  }
}

export default function App() {
  const [settings, setSettings] = useState<Record<string, unknown>>({});

  useEffect(() => {
    window.bizzi?.getSettings().then(setSettings);
  }, []);

  const updateSetting = (key: string, value: unknown) => {
    window.bizzi?.setSettings(key, value).then(setSettings);
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-6">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold">Bizzi Cloud Desktop</h1>
        <p className="text-zinc-400 text-sm mt-1">
          Mount your cloud drive locally for NLE editing
        </p>
      </header>

      <div className="space-y-8 max-w-2xl">
        <MountPanel
          settings={settings}
          onUpdate={updateSetting}
        />
        <StreamCachePanel
          cacheBaseDir={String(settings.cacheBaseDir ?? "")}
          maxBytes={Number(settings.streamCacheMaxBytes ?? 50 * 1024 ** 3)}
          onUpdate={updateSetting}
        />
        <LocalStorePanel />
      </div>
    </div>
  );
}
