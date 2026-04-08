import { useEffect, useState } from "react";
import { AuthPanel } from "./components/AuthPanel";
import { MountPanel } from "./components/MountPanel";
import { LocalStorePanel } from "./components/LocalStorePanel";
import { StreamCachePanel } from "./components/StreamCachePanel";

declare global {
  interface Window {
    bizzi?: {
      getSettings: () => Promise<Record<string, unknown>>;
      setSettings: (key: string, value: unknown) => Promise<Record<string, unknown>>;
      getPath: (name: "userData" | "cacheBase") => Promise<string>;
      nativeSync?: {
        isAvailable: () => Promise<boolean>;
        getStatus: () => Promise<{ isEnabled: boolean }>;
        enable: (apiBaseUrl: string, token: string) => Promise<{ syncPath: string }>;
        disable: () => Promise<void>;
        refreshToken: (token: string) => Promise<void>;
        refreshFolder: (driveSlug: string) => Promise<void>;
      };
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
    <div className="min-h-screen bg-neutral-950 text-neutral-100 p-6">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold">
          Bizzi <span className="text-bizzi-blue">Cloud</span> Desktop
        </h1>
        <p className="text-neutral-400 text-sm mt-1">
          Apple File Provider sync for NLE editing—no macFUSE
        </p>
      </header>

      <AuthPanel>
        {({ user, loading, getToken, signInForm }) => (
          <div className="space-y-8 max-w-2xl">
            {signInForm}
            <MountPanel
              settings={settings}
              onUpdate={updateSetting}
              getToken={getToken}
              isSignedIn={!!user}
              authLoading={loading}
            />
            <StreamCachePanel
              cacheBaseDir={String(settings.cacheBaseDir ?? "")}
              maxBytes={Number(settings.streamCacheMaxBytes ?? 500 * 1024 ** 3)}
              onUpdate={updateSetting}
            />
            <LocalStorePanel />
          </div>
        )}
      </AuthPanel>
    </div>
  );
}
