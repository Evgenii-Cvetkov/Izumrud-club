"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "./Logo";

const ITEMS = [
  { href: "/feed", label: "Главная", icon: "M3 10.5 12 3l9 7.5V21h-6v-6H9v6H3z" },
  { href: "/lectures", label: "Лекции", icon: "M4 5h16v11H4zM8 20h8M12 16v4" },
  { href: "/articles", label: "Статьи", icon: "M6 3h9l3 3v15H6zM9 9h6M9 13h6M9 17h4" },
  { href: "/meetings", label: "Встречи", icon: "M3 7h4l2-3h6l2 3h4v13H3zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" },
  { href: "/profile", label: "Профиль", icon: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21c1-4 4-6 8-6s7 2 8 6" },
] as const;

export function AppNav() {
  const path = usePathname();
  const isActive = (href: string) => path === href || path.startsWith(href + "/");

  return (
    <>
      <header className="sticky top-0 z-30 border-b border-line bg-mineral/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4">
          <Logo href="/feed" />
          <nav aria-label="Разделы" className="hidden gap-1 md:flex">
            {ITEMS.map((it) => (
              <Link
                key={it.href}
                href={it.href}
                aria-current={isActive(it.href) ? "page" : undefined}
                className={`rounded px-3 py-2.5 text-[0.95rem] ${isActive(it.href) ? "bg-tint font-medium text-emerald-deep" : "text-muted hover:text-ink"}`}
              >
                {it.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>

      <nav
        aria-label="Разделы"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-paper pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        <ul className="grid grid-cols-5">
          {ITEMS.map((it) => {
            const active = isActive(it.href);
            return (
              <li key={it.href}>
                <Link
                  href={it.href}
                  aria-current={active ? "page" : undefined}
                  className={`flex h-16 flex-col items-center justify-center gap-1 text-[0.72rem] ${active ? "text-emerald" : "text-muted"}`}
                >
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2 : 1.6} strokeLinejoin="round" strokeLinecap="round" aria-hidden>
                    <path d={it.icon} />
                  </svg>
                  {it.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}
