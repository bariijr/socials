import clsx from "clsx";

function toneFor(status: string): "ok" | "warn" | "danger" | "neutral" {
  const s = status.toUpperCase();
  if (s.includes("VERIFIED") && !s.includes("UNVERIFIED") && !s.includes("NOT")) return "ok";
  if (
    s.includes("APPROVED") ||
    s === "ASSIGNABLE" ||
    s === "CLEARED" ||
    s === "LIVE" ||
    s === "FEASIBLE" ||
    s === "OK" ||
    // Trip lifecycle: Active/Completed/Billed read as healthy progress.
    s === "ACTIVE" ||
    s === "COMPLETED" ||
    s === "BILLED"
  )
    return "ok";
  if (
    s.includes("BLOCKED") ||
    s.includes("OVERDUE") ||
    s.includes("EXCEEDS") ||
    s.includes("NOT FEASIBLE") ||
    s === "ACTION REQUIRED" ||
    s === "CANCELLED"
  )
    return "danger";
  if (
    s.includes("UNVERIFIED") ||
    s.includes("PENDING") ||
    s.includes("INCOMPLETE") ||
    s.includes("URGENT") ||
    s.includes("PILOT") ||
    s.includes("ADVISORY") ||
    s.includes("DUE SOON") ||
    s === "TIGHT" ||
    s === "CHECK"
  )
    return "warn";
  return "neutral";
}

export function StatusChip({ status }: { status: string }) {
  const tone = toneFor(status);
  return (
    <span
      className={clsx("status-chip", {
        "status-chip-ok": tone === "ok",
        "status-chip-warn": tone === "warn",
        "status-chip-danger": tone === "danger",
        "status-chip-neutral": tone === "neutral",
      })}
    >
      {status}
    </span>
  );
}
