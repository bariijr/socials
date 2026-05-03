'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { api } from '@/lib/api';
import { formatDateTime, hasRole } from '@/lib/utils';
import { useAuthStore } from '@/store';
import { AuditLog } from '@/types';

const METHOD_COLORS: Record<string, string> = {
  GET: 'bg-gray-400',
  POST: 'bg-green-500',
  PATCH: 'bg-amber-500',
  PUT: 'bg-amber-500',
  DELETE: 'bg-red-500',
};

const ENTITY_OPTIONS = ['Loan', 'User', 'KYC', 'Receipt', 'Disbursement'];

function MethodDot({ method }: { method?: string }) {
  const color = METHOD_COLORS[method?.toUpperCase() ?? ''] ?? 'bg-gray-300';
  return (
    <span
      className={`inline-block w-2 h-2 rounded-full flex-shrink-0 mt-1 ${color}`}
      title={method}
    />
  );
}

export default function AuditPage() {
  const router = useRouter();
  const { user } = useAuthStore();
  const [search, setSearch] = useState('');
  const [entity, setEntity] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 50;

  // Redirect non-admins
  useEffect(() => {
    if (user && !hasRole(user.role, ['admin', 'super_admin'])) {
      router.replace('/dashboard');
    }
  }, [user, router]);

  const { data, isLoading } = useQuery({
    queryKey: ['audit-logs', { search, entity, page }],
    queryFn: () =>
      api.get<any>('/audit-logs', {
        params: {
          search: search || undefined,
          entity: entity || undefined,
          page,
          limit: pageSize,
        },
      }),
    enabled: !!user && hasRole(user.role, ['admin', 'super_admin']),
  });

  // While checking auth or redirecting
  if (!user || !hasRole(user.role, ['admin', 'super_admin'])) {
    return null;
  }

  const items: AuditLog[] = data?.items ?? [];
  const total: number = data?.total ?? 0;
  const pages: number = data?.pages ?? 1;

  return (
    <div className="space-y-4 pt-4 pb-4">
      {/* Header */}
      <div>
        <h1 className="page-title">Audit Logs</h1>
        <p className="text-xs text-gray-500">{total} total entries</p>
      </div>

      {/* Filters */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
          <input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="input pl-9 text-sm py-2"
            placeholder="Search action or entity..."
          />
        </div>
        <select
          value={entity}
          onChange={(e) => {
            setEntity(e.target.value);
            setPage(1);
          }}
          className="input w-auto text-sm py-2 px-3"
        >
          <option value="">All entities</option>
          {ENTITY_OPTIONS.map((e) => (
            <option key={e} value={e}>
              {e}
            </option>
          ))}
        </select>
      </div>

      {/* Audit List */}
      <div className="bg-white rounded-2xl shadow-card overflow-hidden">
        {isLoading &&
          [...Array(8)].map((_, i) => (
            <div
              key={i}
              className="h-14 skeleton border-b border-gray-50 last:border-0"
            />
          ))}

        {!isLoading && items.length === 0 && (
          <div className="text-center py-12">
            <p className="text-gray-400 text-sm">No audit logs found</p>
          </div>
        )}

        {!isLoading &&
          items.map((log: AuditLog) => (
            <div
              key={log.id}
              className="flex items-start justify-between px-4 py-3 border-b border-gray-50 last:border-0 hover:bg-gray-50 transition-colors"
            >
              {/* Left */}
              <div className="flex items-start gap-2.5 min-w-0 flex-1">
                <MethodDot method={log.requestMethod} />
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-gray-900 truncate">
                      {log.action}
                    </span>
                    {log.entity && (
                      <span className="badge bg-gray-100 text-gray-600 text-[10px]">
                        {log.entity}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {log.userEmail ?? 'system'}
                    {log.entityId && (
                      <span className="ml-2 font-mono text-[10px] text-gray-300">
                        #{log.entityId.substring(0, 8)}
                      </span>
                    )}
                  </p>
                </div>
              </div>

              {/* Right */}
              <div className="flex-shrink-0 text-right ml-3">
                <p className="text-xs text-gray-500">
                  {formatDateTime(log.createdAt)}
                </p>
                {log.ipAddress && (
                  <p className="text-[10px] text-gray-300 mt-0.5">{log.ipAddress}</p>
                )}
                {log.responseStatus != null && (
                  <span
                    className={`badge text-[10px] mt-0.5 ${
                      log.responseStatus >= 200 && log.responseStatus < 300
                        ? 'bg-green-50 text-green-600'
                        : log.responseStatus >= 400
                        ? 'bg-red-50 text-red-500'
                        : 'bg-gray-100 text-gray-500'
                    }`}
                  >
                    {log.responseStatus}
                  </span>
                )}
              </div>
            </div>
          ))}
      </div>

      {/* Pagination */}
      {!isLoading && pages > 1 && (
        <div className="flex items-center justify-between">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="btn-secondary text-sm py-2 px-4"
          >
            Previous
          </button>
          <span className="text-xs text-gray-500">
            Page {page} of {pages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(pages, p + 1))}
            disabled={page >= pages}
            className="btn-secondary text-sm py-2 px-4"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
