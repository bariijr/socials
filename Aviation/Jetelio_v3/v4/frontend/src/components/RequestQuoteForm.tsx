"use client";

import { useState } from "react";
import { api, ApiError } from "@/lib/api";
import type { RequestQuoteRequest, RequestQuoteResult } from "@/lib/types";

interface Props {
  checkId: string;
  onSuccess: (tripId: string) => void;
  initialName?: string;
  initialEmail?: string;
  initialPhone?: string;
}

export function RequestQuoteForm({ checkId, onSuccess, initialName, initialEmail, initialPhone }: Props) {
  const [name, setName] = useState(initialName ?? "");
  const [email, setEmail] = useState(initialEmail ?? "");
  const [phone, setPhone] = useState(initialPhone ?? "");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const payload: RequestQuoteRequest = {
        check_id: checkId,
        contact_name: name,
        contact_email: email,
        contact_phone: phone || undefined,
        notes: notes || undefined,
      };
      const result = await api.post<RequestQuoteResult>("/feasibility/request-quote", payload);
      onSuccess(result.trip_id);
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 404
          ? "This result has expired — please run the feasibility check again."
          : "Could not submit the request — please try again."
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4 rounded-2xl border border-accent/15 bg-surface p-4 shadow-md shadow-black/10 sm:p-6">
      <h3 className="text-sm font-semibold text-fg/70">Request a quote</h3>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm text-fg/60">Name</label>
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="h-11 w-full rounded-md border border-fg/20 bg-transparent px-3 text-base text-fg"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm text-fg/60">Email</label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="h-11 w-full rounded-md border border-fg/20 bg-transparent px-3 text-base text-fg"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm text-fg/60">Phone (optional)</label>
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="h-11 w-full rounded-md border border-fg/20 bg-transparent px-3 text-base text-fg"
          />
        </div>
      </div>
      <div>
        <label className="mb-1 block text-sm text-fg/60">Notes (optional)</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          className="w-full rounded-md border border-fg/20 bg-transparent px-3 py-2 text-base text-fg"
        />
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}
      <button
        type="submit"
        disabled={submitting}
        className="h-11 rounded-md bg-primary px-5 text-sm font-semibold text-fg disabled:opacity-50"
      >
        {submitting ? "Submitting…" : "Request quote"}
      </button>
    </form>
  );
}
