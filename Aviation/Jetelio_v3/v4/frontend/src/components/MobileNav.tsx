"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ADMIN_NAV_LINKS } from "@/lib/adminNav";

const PRIMARY_LINKS = [
  { href: "/admin", label: "Home", icon: IconHome },
  { href: "/admin/trips", label: "Trips", icon: IconTrips },
  { href: "/operators", label: "Operators", icon: IconOperators },
];

// Bottom bar only has room for 3 curated destinations + "More" — everything
// else from the shared nav list falls into the overflow sheet automatically,
// so adding a new destination to ADMIN_NAV_LINKS never needs a second edit
// here (task #99).
const PRIMARY_HREFS = new Set(PRIMARY_LINKS.map((l) => l.href));
const MORE_LINKS = ADMIN_NAV_LINKS.filter((l) => !PRIMARY_HREFS.has(l.href));

const PUBLIC_PATHS = new Set(["/", "/login"]);

// Mobile/tablet bottom nav bar — desktop keeps AdminNav's top bar; below
// the md breakpoint that wraps awkwardly, so this replaces it there. Firm
// requirement from the luxury pass (task #88): PWA-installable apps on
// this user's other projects always get a bottom nav on small screens, not
// a scaled-down desktop layout.
export function MobileNav() {
  const pathname = usePathname();
  const [authed, setAuthed] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

  useEffect(() => {
    setAuthed(Boolean(window.localStorage.getItem("jetelio_access_token")));
    setMoreOpen(false);
  }, [pathname]);

  if (!authed || PUBLIC_PATHS.has(pathname)) return null;

  const moreActive = MORE_LINKS.some((l) => l.href === pathname);

  return (
    <>
      {moreOpen && (
        <div className="fixed inset-0 z-40 bg-black/50 md:hidden" onClick={() => setMoreOpen(false)}>
          <div
            className="absolute inset-x-0 bottom-16 rounded-t-2xl border-t border-accent/20 bg-surface p-2 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {MORE_LINKS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`block rounded-lg px-4 py-3 text-base ${
                  pathname === item.href ? "bg-primary/15 text-primary" : "text-fg/80 hover:bg-fg/5"
                }`}
              >
                {item.label}
              </Link>
            ))}
          </div>
        </div>
      )}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-accent/15 bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
        <div className="grid grid-cols-4">
          {PRIMARY_LINKS.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex flex-col items-center gap-1 py-2.5 text-[11px] ${active ? "text-primary" : "text-fg/60"}`}
              >
                <item.icon active={active} />
                {item.label}
              </Link>
            );
          })}
          <button
            type="button"
            onClick={() => setMoreOpen((v) => !v)}
            className={`flex flex-col items-center gap-1 py-2.5 text-[11px] ${moreOpen || moreActive ? "text-primary" : "text-fg/60"}`}
          >
            <IconMore active={moreOpen || moreActive} />
            More
          </button>
        </div>
      </nav>
    </>
  );
}

type IconProps = { active: boolean };

function IconHome({ active }: IconProps) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.25 : 1.75} strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 11.5 12 4l9 7.5" />
      <path d="M5 10v9a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1v-9" />
    </svg>
  );
}

function IconTrips({ active }: IconProps) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.25 : 1.75} strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2.5 2v1.5l4-1 4 1V21l-2.5-2v-5.5l8 2.5Z" />
    </svg>
  );
}

function IconOperators({ active }: IconProps) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.25 : 1.75} strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 21V6a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v15" />
      <path d="M14 21v-9a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v9" />
      <path d="M8 8h0M8 12h0M8 16h0" />
      <path d="M2 21h20" />
    </svg>
  );
}

function IconMore({ active }: IconProps) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.25 : 1.75} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="5" cy="12" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="19" cy="12" r="1.4" fill="currentColor" stroke="none" />
    </svg>
  );
}
