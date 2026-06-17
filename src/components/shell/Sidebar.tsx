"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, FlaskConical, Compass, TrendingUp, TrendingDown, Telescope,
  Star, Target, BookOpen, Bell, Calendar, FileText, Settings, HelpCircle,
} from "lucide-react";

const NAV = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/research", label: "Research", icon: FlaskConical },
  { href: "/decision-center", label: "Decision Center", icon: Compass },
  { href: "/buy-rankings", label: "Buy Rankings", icon: TrendingUp },
  { href: "/sell-rankings", label: "Sell Rankings", icon: TrendingDown },
  { href: "/opportunity-finder", label: "Opportunity Finder", icon: Telescope },
  { href: "/watchlists", label: "Watchlists", icon: Star },
  { href: "/thesis-tracker", label: "Thesis Tracker", icon: Target },
  { href: "/journal", label: "Journal", icon: BookOpen },
  { href: "/alerts", label: "Alerts", icon: Bell },
  { href: "/calendar", label: "Calendar", icon: Calendar },
  { href: "/reports", label: "Reports", icon: FileText },
];

const FOOTER = [
  { href: "/settings", label: "Settings", icon: Settings },
  { href: "/help", label: "Help & Support", icon: HelpCircle },
];

export function Sidebar() {
  const pathname = usePathname();
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  return (
    <aside className="flex h-screen w-60 shrink-0 flex-col border-r border-line bg-surface">
      <div className="px-6 py-6">
        <div className="font-display text-2xl font-bold tracking-tight text-ink">
          STOCK<span className="text-brand">IQ</span>
        </div>
        <div className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-brand">Personal</div>
      </div>

      <nav className="flex-1 overflow-y-auto px-3">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = isActive(href);
          return (
            <Link
              key={href}
              href={href}
              className={`mb-0.5 flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors ${
                active ? "bg-paper text-ink" : "text-muted hover:bg-paper/60 hover:text-ink"
              }`}
            >
              <Icon size={17} className={active ? "text-ink" : "text-muted"} strokeWidth={1.9} />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-line px-3 py-3">
        {FOOTER.map(({ href, label, icon: Icon }) => (
          <Link key={href} href={href} className="mb-0.5 flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] font-medium text-muted hover:bg-paper/60 hover:text-ink">
            <Icon size={17} strokeWidth={1.9} />
            {label}
          </Link>
        ))}
        <div className="mt-2 flex items-center gap-3 rounded-lg px-3 py-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-ink text-[13px] font-semibold text-surface">M</div>
          <div className="leading-tight">
            <div className="text-[13px] font-semibold text-ink">Markist</div>
            <div className="text-[11px] text-brand">Premium Plan</div>
          </div>
        </div>
      </div>
    </aside>
  );
}
