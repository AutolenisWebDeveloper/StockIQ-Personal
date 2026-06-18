"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Login failed");
        return;
      }
      // Session cookie is set; re-run middleware on the destination.
      router.replace("/");
      router.refresh();
    } catch {
      setError("Network error — please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-paper px-4">
      <div className="w-full max-w-sm rounded-card border border-line bg-surface p-8 shadow-card">
        <div className="mb-6 text-center">
          <h1 className="font-display text-2xl font-bold text-ink">
            Stock<span className="text-brand">IQ</span>
          </h1>
          <p className="mt-1 text-[13px] text-muted">Sign in to your terminal</p>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label htmlFor="email" className="mb-1 block text-[13px] font-medium text-ink">
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-card border border-line bg-paper px-3 py-2 text-[14px] text-ink outline-none focus:border-brand"
            />
          </div>

          <div>
            <label htmlFor="password" className="mb-1 block text-[13px] font-medium text-ink">
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-card border border-line bg-paper px-3 py-2 text-[14px] text-ink outline-none focus:border-brand"
            />
          </div>

          {error && (
            <div className="rounded-card border border-sell/40 bg-sell-soft px-3 py-2 text-[13px] text-sell">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-card bg-ink px-3 py-2 text-[14px] font-semibold text-surface transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {submitting ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </main>
  );
}
