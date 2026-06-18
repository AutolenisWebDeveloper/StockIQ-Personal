import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { sql } from "@/lib/db";

async function unreadCount(): Promise<number> {
  try {
    const [r] = await sql<{ count: number }[]>`SELECT count(*)::int AS count FROM notifications WHERE read_at IS NULL`;
    return r?.count ?? 0;
  } catch {
    return 0;
  }
}

export async function AppShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  alerts?: number; // accepted for back-compat; the badge now reflects real unread count
  children: React.ReactNode;
}) {
  const alerts = await unreadCount();
  return (
    <div className="flex min-h-screen bg-paper">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar title={title} subtitle={subtitle} alerts={alerts} />
        <main className="flex-1 px-8 pb-10 pt-2">{children}</main>
      </div>
    </div>
  );
}
