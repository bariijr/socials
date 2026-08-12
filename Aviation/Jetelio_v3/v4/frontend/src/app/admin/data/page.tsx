"use client";

import { useState } from "react";
import { api, ApiError } from "@/lib/api";
import type { ImportReport } from "@/lib/types";
import { useRequireAuth } from "@/lib/useRequireAuth";
import { getCurrentUserRole, canDelete } from "@/lib/jwt";
import { formatUtc } from "@/lib/format";
import { StatusChip } from "@/components/StatusChip";

export default function DataImportPage() {
  useRequireAuth();
  const role = getCurrentUserRole();
  const canImport = canDelete(role); // SUPER_ADMIN only — matches the backend gate exactly

  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [report, setReport] = useState<ImportReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleDownload() {
    setDownloading(true);
    setError(null);
    try {
      const blob = await api.download("/admin/import/export");
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "jetelio-reference-data-export.xlsx";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof ApiError ? `Download failed (HTTP ${err.status}).` : "Could not reach the API.");
    } finally {
      setDownloading(false);
    }
  }

  async function handleUpload() {
    if (!file) return;
    setUploading(true);
    setError(null);
    setReport(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const result = await api.upload<ImportReport>("/admin/import", formData);
      setReport(result);
    } catch (err) {
      if (err instanceof ApiError) {
        const detail = err.body && typeof err.body === "object" && "detail" in err.body ? (err.body as { detail: unknown }).detail : err.body;
        setError(typeof detail === "string" ? detail : `Import failed (HTTP ${err.status}).`);
      } else {
        setError("Could not reach the API.");
      }
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold">Data import &amp; export</h1>
        <p className="text-fg/60">
          Download the current reference data (countries, airports, operators, aircraft, vendors, service catalogue,
          visa data, message templates, users &amp; settings) as an editable workbook, or upload one to re-run the
          importer — same format and sheets the deploy-time CLI importer uses.
        </p>
      </header>

      {!canImport ? (
        <p className="rounded-md border border-warning/40 bg-warning/10 p-3 text-sm text-warning">
          Only SUPER ADMIN can download or upload reference data — this exposes/rewrites core platform data.
        </p>
      ) : (
        <>
          <section className="space-y-3 rounded-lg border border-fg/10 p-4">
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                disabled={downloading}
                onClick={handleDownload}
                className="h-11 rounded-md border border-fg/20 px-4 text-sm font-semibold text-fg hover:border-primary disabled:opacity-50"
              >
                {downloading ? "Preparing…" : "Download current data"}
              </button>
            </div>
            <p className="text-xs text-fg/50">
              Reconstructs the workbook from live data right now — edit it and re-upload below when ready. VISA RULES
              is fully replaced on every upload (no per-row merge), so always start from a fresh download rather than
              an old copy.
            </p>
          </section>

          <section className="space-y-3 rounded-lg border border-fg/10 p-4">
            <div className="flex flex-wrap items-center gap-3">
              <input
                type="file"
                accept=".xlsx"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className="text-sm text-fg/70"
              />
              <button
                type="button"
                disabled={!file || uploading}
                onClick={handleUpload}
                className="h-11 rounded-md bg-primary px-4 text-sm font-semibold text-fg disabled:opacity-50"
              >
                {uploading ? "Importing…" : "Upload & import"}
              </button>
            </div>
            <p className="text-xs text-fg/50">
              .xlsx only, up to 50 MB. Country/FIR polygon geometry is not affected — that comes from a separate
              deploy-time asset, not this workbook.
            </p>
          </section>
          {error && <p className="text-sm text-danger">{error}</p>}
        </>
      )}

      {report && (
        <section className="space-y-6">
          <div>
            <h2 className="mb-2 text-lg font-semibold">Import report</h2>
            <p className="text-xs text-fg/50">
              {report.source_file} — {formatUtc(report.started_at)} → {formatUtc(report.finished_at)}
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-fg/50">
                  <th className="pb-1 pr-2">Sheet</th>
                  <th className="pb-1 pr-2">Seen</th>
                  <th className="pb-1 pr-2">Loaded</th>
                  <th className="pb-1 pr-2">Skipped</th>
                  <th className="pb-1">Quarantined</th>
                </tr>
              </thead>
              <tbody>
                {report.sheets.map((s) => (
                  <tr key={s.sheet} className="border-t border-fg/10">
                    <td className="py-1 pr-2">{s.sheet}</td>
                    <td className="mono-figures py-1 pr-2">{s.rows_seen}</td>
                    <td className="mono-figures py-1 pr-2">{s.rows_loaded}</td>
                    <td className="mono-figures py-1 pr-2">{s.rows_skipped}</td>
                    <td className="mono-figures py-1">{s.rows_quarantined}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {report.sheets.some((s) => s.notes.length > 0) && (
            <div className="space-y-2 text-xs text-fg/60">
              {report.sheets
                .filter((s) => s.notes.length > 0)
                .map((s) => (
                  <div key={s.sheet}>
                    <span className="font-semibold">{s.sheet}:</span> {s.notes.slice(0, 5).join("; ")}
                    {s.notes.length > 5 && ` … and ${s.notes.length - 5} more`}
                  </div>
                ))}
            </div>
          )}

          <div className="flex items-center gap-3">
            <StatusChip status={report.pilot_exit.verdict} />
            <span className="text-sm text-fg/60">
              {report.pilot_exit.blocked_gate_count} of {report.pilot_exit.total_gate_count} pilot-exit gates blocked ·{" "}
              {report.overall_percent_complete}% reference data populated
            </span>
          </div>
        </section>
      )}
    </div>
  );
}
