'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { CalendarDays, GraduationCap, Inbox, Plane, Settings } from 'lucide-react';
import { cn } from '@/lib/utils';

// Thumb-reachable bottom tab bar. The /requests route is the time-request inbox
// (the DB table is still named `exceptions`; this is route/label only).
const TABS = [
  { href: '/calendar', label: 'Calendar', Icon: CalendarDays },
  { href: '/requests', label: 'Requests', Icon: Inbox },
  { href: '/trips', label: 'Trips', Icon: Plane },
  { href: '/school-calendars', label: 'School', Icon: GraduationCap },
  { href: '/settings', label: 'Settings', Icon: Settings },
] as const;

export function BottomNav() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Primary"
      // Full-bleed bar so its background fills the home-indicator zone; the row
      // itself is centered + max-width and padded clear of the inset (pb-safe).
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 backdrop-blur"
    >
      <ul className="mx-auto flex w-full max-w-screen-sm items-stretch justify-around pb-safe">
        {TABS.map(({ href, label, Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex min-h-[3.5rem] flex-col items-center justify-center gap-0.5 px-1 pt-2 text-[11px] font-medium leading-none transition-colors',
                  active ? 'text-primary' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <Icon className="h-[22px] w-[22px]" strokeWidth={active ? 2.4 : 1.9} aria-hidden />
                <span>{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
