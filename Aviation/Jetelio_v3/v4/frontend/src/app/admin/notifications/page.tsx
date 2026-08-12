"use client";

import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { Notification, Page } from "@/lib/types";
import { useRequireAuth } from "@/lib/useRequireAuth";
import { formatUtc } from "@/lib/format";

function entityHref(n: Notification): string | null {
  if (n.entity_type === "Trip") return `/admin/trips/${n.entity_id}`;
  return null;
}

export default function NotificationsPage() {
  useRequireAuth();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["notifications", "list"],
    queryFn: () => api.get<Page<Notification>>("/notifications?page_size=100"),
  });

  const markSeen = useMutation({
    mutationFn: (id: string) => api.post<Notification>(`/notifications/${id}/seen`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });

  const markAllSeen = useMutation({
    mutationFn: () => api.post<{ marked: number }>("/notifications/mark-all-seen"),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });

  const unseenCount = data?.items.filter((n) => !n.seen_at).length ?? 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Notifications</h1>
        {unseenCount > 0 && (
          <button
            type="button"
            onClick={() => markAllSeen.mutate()}
            disabled={markAllSeen.isPending}
            className="h-9 rounded-md border border-fg/20 px-3 text-sm text-fg/70 hover:border-fg/40 disabled:opacity-50"
          >
            Mark all as seen
          </button>
        )}
      </div>

      {isLoading && <p className="text-fg/60">Loading…</p>}
      {data && data.items.length === 0 && <p className="text-sm text-fg/50">No notifications yet.</p>}
      {data && data.items.length > 0 && (
        <ul className="divide-y divide-fg/10">
          {data.items.map((n) => {
            const href = entityHref(n);
            return (
              <li key={n.id} className={`flex flex-wrap items-center gap-3 py-3 ${n.seen_at ? "opacity-60" : ""}`}>
                <div className="flex-1">
                  <div className="text-sm">{href ? <Link href={href} className="hover:text-primary">{n.message}</Link> : n.message}</div>
                  <div className="text-xs text-fg/50">{n.kind} — {formatUtc(n.created_at)}</div>
                </div>
                {!n.seen_at && (
                  <button
                    type="button"
                    onClick={() => markSeen.mutate(n.id)}
                    disabled={markSeen.isPending}
                    className="h-8 rounded-md border border-fg/20 px-2.5 text-xs text-fg/70 hover:border-fg/40 disabled:opacity-50"
                  >
                    Mark seen
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
