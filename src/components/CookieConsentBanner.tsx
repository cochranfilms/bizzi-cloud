"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

const STORAGE_KEY = "bizzi_cookie_consent";

interface StoredConsent {
  essential: boolean;
  analytics: boolean;
  functional: boolean;
  timestamp: number;
}

function getStoredConsent(): StoredConsent | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredConsent;
    if (parsed && typeof parsed.essential === "boolean") return parsed;
  } catch {
    // ignore
  }
  return null;
}

function setStoredConsent(consent: StoredConsent) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(consent));
  } catch {
    // ignore
  }
}

export default function CookieConsentBanner() {
  const [visible, setVisible] = useState(false);
  const [customizeOpen, setCustomizeOpen] = useState(false);
  const [analytics, setAnalytics] = useState(false);
  const [functional, setFunctional] = useState(false);

  useEffect(() => {
    const stored = getStoredConsent();
    if (!stored) {
      setVisible(true);
      setAnalytics(false);
      setFunctional(false);
    } else {
      setAnalytics(stored.analytics);
      setFunctional(stored.functional);
    }
  }, []);

  const save = (essential: boolean, analyticsVal: boolean, functionalVal: boolean) => {
    setStoredConsent({
      essential,
      analytics: analyticsVal,
      functional: functionalVal,
      timestamp: Date.now(),
    });
    setVisible(false);
    setCustomizeOpen(false);
    // When HubSpot is added, gate loading here based on analyticsVal
  };

  const handleAcceptAll = () => save(true, true, true);
  const handleRejectAll = () => save(true, false, false);
  const handleCustomize = () => save(true, analytics, functional);

  if (!visible) return null;

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-[100] border-t border-neutral-200 bg-white p-4 shadow-lg dark:border-neutral-800 dark:bg-neutral-900 sm:left-4 sm:right-4 sm:bottom-4 sm:max-w-lg sm:rounded-xl"
      role="dialog"
      aria-label="Cookie consent"
    >
      <div className="mx-auto max-w-2xl">
        <p className="text-sm text-neutral-700 dark:text-neutral-300">
          We use cookies to enhance your browsing experience, analyze site traffic, and personalize
          content. Essential cookies are required for the site to function. You can choose to accept
          or reject optional cookies.
        </p>
        {!customizeOpen ? (
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleAcceptAll}
              className="rounded-lg bg-bizzi-blue px-4 py-2 text-sm font-medium text-white hover:bg-bizzi-cyan"
            >
              Accept All
            </button>
            <button
              type="button"
              onClick={handleRejectAll}
              className="rounded-lg border border-neutral-200 px-4 py-2 text-sm font-medium dark:border-neutral-700 dark:text-neutral-300"
            >
              Reject All
            </button>
            <button
              type="button"
              onClick={() => setCustomizeOpen(true)}
              className="rounded-lg border border-neutral-200 px-4 py-2 text-sm font-medium dark:border-neutral-700 dark:text-neutral-300"
            >
              Customize
            </button>
            <Link
              href="/privacy#cookies"
              className="self-center text-sm text-bizzi-blue hover:underline"
            >
              Learn more
            </Link>
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            <div className="flex items-center gap-2">
              <input type="checkbox" checked disabled className="rounded" />
              <span className="text-sm">Essential (required)</span>
            </div>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={analytics}
                onChange={(e) => setAnalytics(e.target.checked)}
                className="rounded border-neutral-300 text-bizzi-blue focus:ring-bizzi-blue"
              />
              <span className="text-sm">Analytics</span>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={functional}
                onChange={(e) => setFunctional(e.target.checked)}
                className="rounded border-neutral-300 text-bizzi-blue focus:ring-bizzi-blue"
              />
              <span className="text-sm">Functional</span>
            </label>
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={handleCustomize}
                className="rounded-lg bg-bizzi-blue px-4 py-2 text-sm font-medium text-white hover:bg-bizzi-cyan"
              >
                Save preferences
              </button>
              <button
                type="button"
                onClick={() => setCustomizeOpen(false)}
                className="rounded-lg border border-neutral-200 px-4 py-2 text-sm dark:border-neutral-700"
              >
                Back
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
