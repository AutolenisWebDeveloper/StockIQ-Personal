"use client";

// Last-resort boundary for errors thrown in the root layout itself. It must
// render its own <html>/<body> because it replaces the root layout. Styles are
// inline since the layout (and its CSS) may not have mounted. Page-level errors
// are handled by app/error.tsx; this only catches failures above that.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          fontFamily: "system-ui, -apple-system, sans-serif",
          display: "flex",
          minHeight: "100vh",
          alignItems: "center",
          justifyContent: "center",
          margin: 0,
          background: "#f5f3ee",
          color: "#1f2430",
        }}
      >
        <div style={{ maxWidth: 420, textAlign: "center", padding: 32 }}>
          <h1 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>Something went wrong</h1>
          <p style={{ fontSize: 13, color: "#6b7280", marginTop: 8 }}>
            A client-side error interrupted the app.
          </p>
          {error.digest && (
            <p style={{ fontSize: 11, color: "#9ca3af", fontFamily: "monospace", marginTop: 8 }}>
              ref: {error.digest}
            </p>
          )}
          <button
            onClick={reset}
            style={{
              marginTop: 16,
              padding: "8px 16px",
              fontSize: 13,
              fontWeight: 600,
              borderRadius: 8,
              border: "none",
              background: "#2563eb",
              color: "#fff",
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
