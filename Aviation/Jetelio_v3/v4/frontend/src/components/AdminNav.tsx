"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { Page } from "@/lib/types";
import { ADMIN_NAV_LINKS } from "@/lib/adminNav";

const LINKS = [{ href: "/admin", label: "Dashboard" }, ...ADMIN_NAV_LINKS];

const PUBLIC_PATHS = new Set(["/", "/login"]);

// Global back/forward + cross-section links for the authenticated app —
// GateBanner/ThemeToggle already render unconditionally in layout.tsx, this
// follows the same pattern but self-hides on the public FIQ door and login.
export function AdminNav() {
  const pathname = usePathname();
  const router = useRouter();
  const [authed, setAuthed] = useState(false);

  useEffect(() => {
    setAuthed(Boolean(window.localStorage.getItem("jetelio_access_token")));
  }, [pathname]);

  // Polling, not pushed — task #106, matches this stack's existing
  // no-websocket/realtime-infra convention. page_size=1 keeps the request
  // cheap; only `total` is read.
  const { data: unseen } = useQuery({
    queryKey: ["notifications", "unseen-count"],
    queryFn: () => api.get<Page<unknown>>("/notifications?unseen=true&page_size=1"),
    enabled: authed,
    refetchInterval: 30_000,
  });

  if (!authed || PUBLIC_PATHS.has(pathname)) return null;

  return (
    <div className="sticky top-0 z-40 hidden items-center gap-1 border-b border-accent/15 bg-base/95 px-4 py-2.5 backdrop-blur md:flex">
      <button
        type="button"
        onClick={() => router.back()}
        aria-label="Back"
        className="h-8 rounded-md border border-fg/20 px-2 text-sm text-fg/70 hover:border-accent hover:text-accent"
      >
        ←
      </button>
      <button
        type="button"
        onClick={() => router.forward()}
        aria-label="Forward"
        className="h-8 rounded-md border border-fg/20 px-2 text-sm text-fg/70 hover:border-accent hover:text-accent"
      >
        →
      </button>
      <span className="mx-2 h-5 w-px bg-fg/10" />
      <div className="flex flex-wrap gap-1">
        {LINKS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`rounded-md px-2.5 py-1 text-sm transition-colors ${
              pathname === item.href ? "bg-primary text-fg" : "text-fg/60 hover:bg-fg/10"
            }`}
          >
            {item.label}
          </Link>
        ))}
      </div>
      <Link
        href="/admin/notifications"
        className={`ml-auto flex h-8 items-center gap-1.5 rounded-md px-2.5 text-sm transition-colors ${
          pathname === "/admin/notifications" ? "bg-primary text-fg" : "text-fg/60 hover:bg-fg/10"
        }`}
      >
        <span aria-hidden>🔔</span>
        {!!unseen && unseen.total > 0 && (
          <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-danger px-1 text-xs font-semibold text-white">
            {unseen.total}
          </span>
        )}
      </Link>
    </div>
  );
}
