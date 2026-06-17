import { AppShell } from "./AppShell";

// Stub page for nav routes whose full UI lands in a later phase. Keeps the shell
// + navigation consistent so the dashboard's links are all live.
export function ComingSoon({ title, phase }: { title: string; phase?: string }) {
  return (
    <AppShell title={title} subtitle="Here's what matters today." alerts={8}>
      <div className="rounded-card border border-line bg-surface p-10 text-center shadow-card">
        <h2 className="font-display text-lg font-semibold text-ink">{title}</h2>
        <p className="mx-auto mt-2 max-w-md text-[13px] text-muted">
          This screen is part of the StockIQ build roadmap{phase ? ` (${phase})` : ""}. The dashboard is the
          live surface; the rest of the navigation is wired and ready for its phase.
        </p>
      </div>
    </AppShell>
  );
}
