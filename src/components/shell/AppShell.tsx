import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";

export function AppShell({
  title,
  subtitle,
  alerts,
  children,
}: {
  title: string;
  subtitle?: string;
  alerts?: number;
  children: React.ReactNode;
}) {
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
