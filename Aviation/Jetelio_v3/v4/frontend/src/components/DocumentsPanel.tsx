"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api";
import { getCurrentUserEmail } from "@/lib/jwt";
import type { Credential, CredentialCreateRequest, DocumentEntityType, DocumentTypeTemplate, EntityDocument } from "@/lib/types";
import { StatusChip } from "@/components/StatusChip";

const inputCls = "h-10 w-full rounded-md border border-fg/20 bg-transparent px-3 text-sm text-fg";
const labelCls = "mb-1 block text-xs text-fg/60";

interface Props {
  entityType: DocumentEntityType;
  entityId: string;
  writable: boolean;
  canDelete: boolean;
}

// Reuses the same upload/list/download/delete shape as operators/[id]/page.tsx's
// AircraftDocumentsPanel (a different, older polymorphic-adjacent system —
// keyed by aircraft_id, not entity_type/entity_id). Adds what that panel
// doesn't need: an OCR-review/verify flow and a Credentials sub-list for
// license-type ratings (task #126).
export function DocumentsPanel({ entityType, entityId, writable, canDelete: allowDelete }: Props) {
  const queryClient = useQueryClient();
  const [docType, setDocType] = useState<string>("");
  const [file, setFile] = useState<File | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [reviewingId, setReviewingId] = useState<string | null>(null);

  const { data: templates } = useQuery({
    queryKey: ["document-type-templates"],
    queryFn: () => api.get<DocumentTypeTemplate[]>("/document-type-templates"),
    staleTime: Infinity, // structural form-schema data, not operational — doesn't change at runtime
  });
  const applicableTemplates = (templates ?? []).filter((t) => t.applies_to_entity_type === entityType);
  const templateByDocType = Object.fromEntries(applicableTemplates.map((t) => [t.doc_type, t]));

  const { data: docs, isLoading } = useQuery({
    queryKey: ["entity-documents", entityType, entityId],
    queryFn: () => api.get<EntityDocument[]>(`/documents/${entityType}/${entityId}`),
  });

  const upload = useMutation({
    mutationFn: async () => {
      if (!file || !docType) throw new Error("Pick a document type and a file");
      const formData = new FormData();
      formData.append("doc_type", docType);
      formData.append("file", file);
      return api.upload<EntityDocument>(`/documents/${entityType}/${entityId}`, formData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["entity-documents", entityType, entityId] });
      setFile(null);
      setUploadError(null);
    },
    onError: (err) => setUploadError(err instanceof ApiError ? "Upload failed — check the file and try again." : "Could not reach the API."),
  });

  const remove = useMutation({
    mutationFn: (docId: string) => api.del<void>(`/documents/${entityType}/${entityId}/${docId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["entity-documents", entityType, entityId] }),
  });

  async function handleDownload(doc: EntityDocument) {
    setDownloadingId(doc.id);
    try {
      const blob = await api.download(`/documents/${entityType}/${entityId}/${doc.id}/download`);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = doc.filename;
      a.click();
      window.URL.revokeObjectURL(url);
    } finally {
      setDownloadingId(null);
    }
  }

  return (
    <div className="space-y-3">
      {writable && (
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <label className={labelCls}>Type</label>
            <select className={`${inputCls}`} value={docType} onChange={(e) => setDocType(e.target.value)}>
              <option value="" className="bg-base">
                Select a document type…
              </option>
              {applicableTemplates.map((t) => (
                <option key={t.doc_type} value={t.doc_type} className="bg-base">
                  {t.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>File</label>
            <input
              type="file"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="block text-sm text-fg/70 file:mr-2 file:h-9 file:rounded-md file:border file:border-fg/20 file:bg-transparent file:px-3 file:text-sm file:text-fg/70"
            />
          </div>
          <button
            type="button"
            disabled={!file || !docType || upload.isPending}
            onClick={() => upload.mutate()}
            className="h-9 rounded-md bg-primary px-3 text-sm font-semibold text-fg disabled:opacity-50"
          >
            {upload.isPending ? "Uploading…" : "Upload"}
          </button>
        </div>
      )}
      {uploadError && <p className="text-sm text-danger">{uploadError}</p>}

      {isLoading && <p className="text-sm text-fg/50">Loading documents…</p>}
      {docs && docs.length === 0 && <p className="text-sm text-fg/50">No documents on file.</p>}
      {docs && docs.length > 0 && (
        <ul className="divide-y divide-fg/10 text-sm">
          {docs.map((doc) => (
            <li key={doc.id} className="py-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="font-medium">{doc.filename}</span>
                  <span className="ml-2 text-xs text-fg/50">{templateByDocType[doc.doc_type]?.name ?? doc.doc_type}</span>
                  {doc.file_size_bytes != null && (
                    <span className="ml-2 text-xs text-fg/40">{(doc.file_size_bytes / 1024).toFixed(0)} KB</span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <StatusChip status={doc.status} />
                  {writable && (
                    <button
                      type="button"
                      onClick={() => setReviewingId(reviewingId === doc.id ? null : doc.id)}
                      className="h-8 rounded-md border border-fg/20 px-2.5 text-xs text-fg/70 hover:border-fg/40"
                    >
                      {reviewingId === doc.id ? "Close" : "Review"}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => handleDownload(doc)}
                    disabled={downloadingId === doc.id}
                    className="h-8 rounded-md border border-fg/20 px-2.5 text-xs text-fg/70 hover:border-fg/40 disabled:opacity-50"
                  >
                    {downloadingId === doc.id ? "…" : "Download"}
                  </button>
                  {allowDelete && (
                    <button
                      type="button"
                      onClick={() => remove.mutate(doc.id)}
                      disabled={remove.isPending}
                      className="h-8 rounded-md border border-danger/40 px-2.5 text-xs text-danger hover:border-danger disabled:opacity-50"
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>
              {reviewingId === doc.id && (
                <DocumentReview
                  entityType={entityType}
                  entityId={entityId}
                  doc={doc}
                  template={templateByDocType[doc.doc_type]}
                  onClose={() => setReviewingId(null)}
                />
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function DocumentReview({
  entityType,
  entityId,
  doc,
  template,
  onClose,
}: {
  entityType: DocumentEntityType;
  entityId: string;
  doc: EntityDocument;
  template: DocumentTypeTemplate | undefined;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();

  const verify = useMutation({
    mutationFn: (status: "VERIFIED" | "REJECTED") =>
      api.post<EntityDocument>(`/documents/${entityType}/${entityId}/${doc.id}/verify`, {
        version: doc.version,
        status,
        verified_by: getCurrentUserEmail() ?? "admin",
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["entity-documents", entityType, entityId] }),
  });

  const scalarFields = (template?.expected_fields ?? []).filter((f) => f.type !== "list");
  const listFields = (template?.expected_fields ?? []).filter((f) => f.type === "list");

  return (
    <div className="mt-2 space-y-3 rounded-md border border-fg/10 bg-fg/5 p-3">
      {doc.status === "VERIFIED" && doc.verified_by && (
        <p className="text-xs text-success">Verified by {doc.verified_by}{doc.verified_on && ` on ${doc.verified_on}`}.</p>
      )}
      {doc.status === "REJECTED" && doc.verified_by && (
        <p className="text-xs text-danger">Rejected by {doc.verified_by}{doc.verified_on && ` on ${doc.verified_on}`}.</p>
      )}

      {!doc.ocr_raw_output && !doc.extracted_fields && (
        <p className="text-xs text-fg/50">
          No OCR result yet — it runs automatically in the background shortly after upload, or may not be available
          for this file. Either way, verify against the actual downloaded file.
        </p>
      )}

      {scalarFields.length > 0 && (
        <div>
          <p className="mb-1 text-xs font-medium text-fg/60">OCR-suggested values (reference only — confirm against the real file):</p>
          <dl className="grid gap-1 text-xs sm:grid-cols-2">
            {scalarFields.map((f) => (
              <div key={f.key} className="flex justify-between gap-2 rounded border border-fg/10 px-2 py-1">
                <dt className="text-fg/50">{f.label}</dt>
                <dd className="mono-figures text-fg/80">{doc.extracted_fields?.[f.key] ?? "—"}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      {doc.ocr_raw_output && (
        <details className="text-xs">
          <summary className="cursor-pointer text-fg/60">Raw OCR text</summary>
          <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap rounded border border-fg/10 bg-base p-2 text-fg/70">
            {doc.ocr_raw_output.text}
          </pre>
        </details>
      )}

      {listFields.length > 0 && <CredentialsSection documentId={doc.id} />}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => verify.mutate("VERIFIED")}
          disabled={verify.isPending}
          className="h-8 rounded-md bg-success/20 px-3 text-xs font-semibold text-success hover:bg-success/30 disabled:opacity-50"
        >
          Mark verified
        </button>
        <button
          type="button"
          onClick={() => verify.mutate("REJECTED")}
          disabled={verify.isPending}
          className="h-8 rounded-md bg-danger/20 px-3 text-xs font-semibold text-danger hover:bg-danger/30 disabled:opacity-50"
        >
          Reject
        </button>
        <button type="button" onClick={onClose} className="h-8 rounded-md border border-fg/20 px-3 text-xs text-fg/70 hover:border-fg/40">
          Close
        </button>
      </div>
      {verify.isError && <p className="text-xs text-danger">Could not save — the document may have changed since this was loaded.</p>}
    </div>
  );
}

// A license Document's "ratings" list-type field maps to real Credential
// rows (type ratings, each with its own issue/expiry date) rather than a
// plain text field — this is the actual persisted mechanism for that data,
// unlike the read-only OCR-suggested scalar fields above.
function CredentialsSection({ documentId }: { documentId: string }) {
  const queryClient = useQueryClient();
  const [ratingCode, setRatingCode] = useState("");
  const [ratingName, setRatingName] = useState("");

  const { data: credentials } = useQuery({
    queryKey: ["credentials", documentId],
    queryFn: () => api.get<Credential[]>(`/credentials?document_id=${documentId}`),
  });

  const add = useMutation({
    mutationFn: () => {
      const payload: CredentialCreateRequest = { document_id: documentId, rating_code: ratingCode, rating_name: ratingName || null };
      return api.post<Credential>("/credentials", payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["credentials", documentId] });
      setRatingCode("");
      setRatingName("");
    },
  });

  const remove = useMutation({
    mutationFn: (c: Credential) => api.del<void>(`/credentials/${c.id}?version=${c.version}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["credentials", documentId] }),
  });

  return (
    <div>
      <p className="mb-1 text-xs font-medium text-fg/60">Type ratings</p>
      {credentials && credentials.length > 0 && (
        <ul className="mb-2 space-y-1 text-xs">
          {credentials.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-2 rounded border border-fg/10 px-2 py-1">
              <span className="mono-figures">
                {c.rating_code}
                {c.rating_name && ` — ${c.rating_name}`}
              </span>
              <button type="button" onClick={() => remove.mutate(c)} className="text-danger hover:underline">
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap items-end gap-2">
        <input
          value={ratingCode}
          onChange={(e) => setRatingCode(e.target.value.toUpperCase())}
          placeholder="Rating code"
          className="mono-figures h-8 w-32 rounded-md border border-fg/20 bg-transparent px-2 text-xs text-fg"
        />
        <input
          value={ratingName}
          onChange={(e) => setRatingName(e.target.value)}
          placeholder="Name (optional)"
          className="h-8 w-40 rounded-md border border-fg/20 bg-transparent px-2 text-xs text-fg"
        />
        <button
          type="button"
          disabled={!ratingCode.trim() || add.isPending}
          onClick={() => add.mutate()}
          className="h-8 rounded-md border border-fg/20 px-2.5 text-xs text-fg/70 hover:border-fg/40 disabled:opacity-50"
        >
          Add
        </button>
      </div>
    </div>
  );
}
