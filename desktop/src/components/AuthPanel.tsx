import { useEffect, useState } from "react";
import {
  isFirebaseConfigured,
  signIn,
  signOut,
  onAuthChange,
  type User,
} from "../lib/firebase";

interface AuthPanelProps {
  children: (props: {
    user: User | null;
    loading: boolean;
    getToken: () => Promise<string | null>;
    signInForm: React.ReactNode;
  }) => React.ReactNode;
}

export function AuthPanel({ children }: AuthPanelProps) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [signingIn, setSigningIn] = useState(false);

  const getToken = async (): Promise<string | null> => {
    const u = user;
    if (!u) return null;
    try {
      return await u.getIdToken();
    } catch {
      return null;
    }
  };

  useEffect(() => {
    if (!isFirebaseConfigured()) {
      setLoading(false);
      return;
    }
    const unsubscribe = onAuthChange((u) => {
      setUser(u);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSigningIn(true);
    try {
      await signIn(email, password);
      setEmail("");
      setPassword("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign in failed");
    } finally {
      setSigningIn(false);
    }
  };

  const handleSignOut = async () => {
    await signOut();
  };

  const signInForm = isFirebaseConfigured() ? (
    <div className="rounded-lg border border-neutral-700 bg-neutral-900/50 p-4">
      {user ? (
        <div className="flex items-center justify-between">
          <span className="text-sm text-neutral-400">
            Signed in as <span className="text-neutral-200">{user.email}</span>
          </span>
          <button
            type="button"
            onClick={handleSignOut}
            className="text-xs text-neutral-500 hover:text-neutral-300"
          >
            Sign out
          </button>
        </div>
      ) : (
        <form onSubmit={handleSignIn} className="space-y-3">
          <div>
            <label className="block text-xs text-neutral-500 mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 rounded bg-neutral-800 border border-neutral-700 text-sm text-neutral-100 placeholder-neutral-500 focus:border-bizzi-blue focus:ring-1 focus:ring-bizzi-blue/30 outline-none transition-colors"
              placeholder="you@example.com"
              required
            />
          </div>
          <div>
            <label className="block text-xs text-neutral-500 mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 rounded bg-neutral-800 border border-neutral-700 text-sm text-neutral-100 placeholder-neutral-500 focus:border-bizzi-blue focus:ring-1 focus:ring-bizzi-blue/30 outline-none transition-colors"
              required
            />
          </div>
          {error && <p className="text-xs text-red-400">{error}</p>}
          <button
            type="submit"
            disabled={signingIn}
            className="w-full py-2 rounded-lg bg-bizzi-blue hover:bg-bizzi-cyan text-white text-sm font-medium disabled:opacity-60 transition-colors"
          >
            {signingIn ? "Signing in…" : "Sign in to Bizzi Cloud"}
          </button>
        </form>
      )}
    </div>
  ) : (
    <p className="text-xs text-amber-500">
      Firebase not configured. Copy .env.example to .env.local and add your Firebase config.
    </p>
  );

  return <>{children({ user, loading, getToken, signInForm })}</>;
}
