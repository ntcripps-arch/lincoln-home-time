import { AppShell } from '@/components/app-shell/app-shell';

// Layout for every signed-in page. Auth gating itself lives in middleware.ts;
// /login and /auth/* sit OUTSIDE this route group, so they render without the shell.
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
