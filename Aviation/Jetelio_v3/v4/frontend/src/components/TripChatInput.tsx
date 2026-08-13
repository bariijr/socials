"use client";

import { useState } from "react";
import { api, ApiError } from "@/lib/api";
import type { ChatTripDraft } from "@/lib/types";

interface Props {
  // Hands back the raw draft — each caller (VIQ vs admin) maps it into its
  // own form state shape, since the two pages' aircraft/leg state differ.
  // Never submits anything itself: the parsed fields land in the same
  // form the user already reviews/edits before hitting submit.
  onParsed: (draft: ChatTripDraft) => void;
}

export function TripChatInput({ onParsed }: Props) {
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [filled, setFilled] = useState(false);

  async function handleParse() {
    if (!message.trim() || loading) return;
    setLoading(true);
    setError(null);
    setWarnings([]);
    setFilled(false);
    try {
      const draft = await api.post<ChatTripDraft>("/feasibility/chat-parse", { message });
      setWarnings(draft.warnings);
      setFilled(true);
      onParsed(draft);
    } catch (err) {
      if (err instanceof ApiError && err.status === 503) {
        setError("Trip-builder chat isn't available right now.");
      } else if (err instanceof ApiError && err.status === 429) {
        setError("Too many requests — try again in a bit.");
      } else {
        setError("Couldn't parse that message — try rephrasing, or fill in the form manually.");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-2 rounded-lg border border-accent/25 bg-accent/5 p-4">
      <label className="block text-sm font-medium text-fg/70">
        Paste a request message to fill in the form below
      </label>
      <textarea
        value={message}
        onChange={(e) => {
          setMessage(e.target.value);
          setFilled(false);
        }}
        rows={4}
        placeholder={
          'e.g. "Request a Ghana permit for N123AB flying from Houston to Kilimanjaro on 16Aug, do not overfly Uganda" — or paste a full structured permit request.'
        }
        className="w-full rounded-md border border-fg/20 bg-transparent px-3 py-2 text-sm text-fg placeholder:text-fg/40"
      />
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={handleParse}
          disabled={loading || !message.trim()}
          className="h-9 rounded-md bg-primary px-4 text-sm font-semibold text-fg disabled:opacity-50"
        >
          {loading ? "Reading…" : "Fill in from message"}
        </button>
        <span className="text-xs text-fg/50">Nothing is submitted automatically — review every field below first.</span>
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}
      {filled && !error && (
        <p className="text-sm text-success">
          Form filled in below{warnings.length > 0 ? " — a few things need a manual check:" : "."}
        </p>
      )}
      {warnings.length > 0 && (
        <ul className="space-y-1 rounded-md border border-warning/40 bg-warning/10 p-2 text-xs text-warning">
          {warnings.map((w, i) => (
            <li key={i}>{w}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
