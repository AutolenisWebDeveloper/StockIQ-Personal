"use client";

import { useEffect } from "react";

// Route-segment error boundary. Without this, any unhandled client-side
// exception in a page bubbles to the root and Next.js replaces the whole
// document with a bare "Application error" message. Here we degrade gracefully
// and offer a retry, and log the real error to the console for diagnosis.
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-paper px-6">
      <div className="max-w-md rounded-card border border-line bg-surface p-8 text-center shadow-card">
        <div className="font-display text-2xl font-bold tracking-tight text-ink">
          STOCK<span className="text-brand">IQ</span>
        </div>
        <h1 className="mt-4 text-[15px] font-semibold text-ink">Something went wrong on this page</h1>
        <p className="mt-2 text-[13px] text-muted">
          A client-side error interrupted rendering. Other pages are unaffected — open the browser
          console for the underlying error.
        </p>
        {error.digest && <p className="mt-2 font-mono text-[11px] text-muted">ref: {error.digest}</p>}
        <button
          onClick={reset}
          className="mt-5 h-9 rounded-lg bg-info px-4 text-[13px] font-semibold text-surface"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
