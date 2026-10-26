import { DesktopSidebar, MobileNav } from "@/components/Nav";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex min-h-screen max-w-[1600px]">
      <DesktopSidebar />
      <div className="min-w-0 flex-1 pb-16 md:pb-0">{children}</div>
      <MobileNav />
    </div>
  );
}
