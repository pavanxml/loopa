"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Icon, type IconName } from "./Icon";
const items: { href: string; label: string; icon: IconName }[] = [
  { href: "/home", label: "The Loop", icon: "home" },
  { href: "/discover", label: "Radar", icon: "compass" },
  { href: "/reels", label: "Flicks", icon: "reels" },
  { href: "/messages", label: "Whispers", icon: "message" },
  { href: "/notifications", label: "Echoes", icon: "heart" },
  { href: "/create", label: "Studio", icon: "plus" },
  { href: "/profile", label: "Your Orbit", icon: "profile" },
];
export function MobileNav() {
  const pathname = usePathname();
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 flex justify-around border-t bg-[rgb(var(--bg))] py-3 md:hidden"
      style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
      aria-label="Primary"
    >
      {items
        .filter((i) =>
          ["/home", "/discover", "/reels", "/create", "/profile"].includes(
            i.href,
          ),
        )
        .map((item) => (
          <Link
            key={item.href}
            href={item.href}
            aria-label={item.label}
            aria-current={pathname === item.href ? "page" : undefined}
            className="rounded-lg p-1"
          >
            <Icon
              name={item.icon}
              filled={pathname === item.href && item.icon === "home"}
            />
          </Link>
        ))}
    </nav>
  );
}
export function DesktopSidebar() {
  const pathname = usePathname(),
    [more, setMore] = useState(false);
  return (
    <aside className="sticky top-0 hidden h-screen w-20 shrink-0 flex-col border-r bg-[rgb(var(--bg))] px-3 py-8 md:flex xl:w-[244px] xl:px-5">
      <Link
        href="/home"
        className="mb-10 px-2 text-center text-3xl font-bold italic tracking-tighter xl:text-left"
        aria-label="Loopa home"
      >
        <span className="hidden xl:inline">
          loopa<span className="text-loop-600">.</span>
        </span>
        <span className="xl:hidden">l.</span>
      </Link>
      <nav className="flex flex-col gap-2" aria-label="Primary">
        {items.map((item) => {
          const active =
            pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              title={item.label}
              aria-current={active ? "page" : undefined}
              className={`flex items-center gap-4 rounded-lg p-3 transition-colors hover:bg-black/5 dark:hover:bg-white/5 ${active ? "font-bold" : "font-normal"}`}
            >
              <Icon name={item.icon} filled={active && item.icon === "home"} />
              <span className="hidden xl:inline">{item.label}</span>
            </Link>
          );
        })}
      </nav>
      <div className="relative mt-auto pt-4">
        {more && (
          <div className="absolute bottom-16 left-0 z-50 w-56 rounded-xl border bg-[rgb(var(--card))] p-2 shadow-popover">
            {[
              ["/saved", "Stash"],
              ["/moments", "Sparks"],
              ["/communities", "Communities"],
              ["/events", "Events"],
              ["/connections", "Connections"],
              ["/settings", "Settings"],
            ].map(([href, label]) => (
              <Link
                key={href}
                href={href!}
                onClick={() => setMore(false)}
                className="block rounded-lg px-4 py-3 text-sm hover:bg-black/5 dark:hover:bg-white/10"
              >
                {label}
              </Link>
            ))}
          </div>
        )}
        <button
          onClick={() => setMore((v) => !v)}
          aria-expanded={more}
          aria-label="More navigation"
          className="flex w-full items-center gap-4 rounded-lg p-3 hover:bg-black/5 dark:hover:bg-white/5"
        >
          <Icon name="menu" />
          <span className="hidden xl:inline">More</span>
        </button>
      </div>
    </aside>
  );
}
