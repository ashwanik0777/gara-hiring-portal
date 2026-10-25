"use client";

/**
 * Last-resort boundary for failures in the root layout. It renders its own document and
 * does not receive global styles, so it uses minimal inline styles. Users only see a
 * plain message and a retry; the reference matches the server log entry.
 */
export default function GlobalError({ error, retry }: { error: unknown; retry: () => void }) {
  const digest =
    typeof error === "object" && error !== null && "digest" in error && typeof error.digest === "string"
      ? error.digest
      : null;
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
          background: "#f8fafc",
          color: "#0f172a",
        }}
      >
        <main role="alert" style={{ maxWidth: 420, padding: 24, textAlign: "center" }}>
          <h1 style={{ fontSize: 20, margin: "0 0 8px" }}>Something went wrong</h1>
          <p style={{ fontSize: 14, color: "#475569", margin: "0 0 20px" }}>
            GARA Innovation is having trouble loading right now. Please try again in a moment.
          </p>
          <button
            type="button"
            onClick={() => retry()}
            style={{
              padding: "10px 18px",
              borderRadius: 8,
              border: "none",
              background: "#2563eb",
              color: "#ffffff",
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Try again
          </button>
          {digest && (
            <p style={{ fontSize: 11, color: "#64748b", marginTop: 20 }}>Reference: {digest}</p>
          )}
        </main>
      </body>
    </html>
  );
}
