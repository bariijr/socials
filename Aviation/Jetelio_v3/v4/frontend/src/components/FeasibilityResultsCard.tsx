import type { LegResult } from "@/lib/types";
import { StatusChip } from "@/components/StatusChip";
import { CountryName } from "@/components/CountryPicker";

export function FeasibilityResultsCard({ result, title }: { result: LegResult; title?: string }) {
  const avoidIncludeViolated = result.permits.state_avoid_include.violated || result.permits.fir_avoid_include.violated;

  return (
    <div className="space-y-6 rounded-2xl border border-accent/15 bg-surface p-4 shadow-md shadow-black/10 sm:p-6">
      <div className="flex items-center gap-3">
        <h2 className="text-lg font-semibold">{title ?? `${result.dep_icao} → ${result.arr_icao}`}</h2>
        <StatusChip status={result.verdict} />
      </div>

      {result.reasons.length > 0 && (
        <ul className="space-y-1 rounded-md border border-fg/10 bg-fg/5 p-3 text-sm text-fg/80">
          {result.reasons.map((reason, i) => (
            <li key={i} className="flex gap-2">
              <span className="text-fg/40">—</span>
              <span>{reason}</span>
            </li>
          ))}
        </ul>
      )}

      <section>
        <h3 className="mb-2 text-sm font-semibold text-fg/70">Route</h3>
        <div className="mono-figures grid gap-2 text-sm sm:grid-cols-3">
          <div>Distance: {result.route.distance_nm.toFixed(0)} NM</div>
          <div>EET: {result.route.eet_hours.toFixed(1)} h</div>
          <div>States crossed: {result.route.states.length}</div>
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          {result.route.states.map((s) => (
            <span key={s.iso3} className="rounded-full border border-fg/10 px-2.5 py-1 text-xs">
              {s.name}
            </span>
          ))}
        </div>
        {result.route.firs.length > 0 && (
          <div className="mt-2 text-xs text-fg/50">
            FIRs: {result.route.firs.map((f) => f.name ?? f.icao_fir_code).join(", ")}
          </div>
        )}
        {avoidIncludeViolated && (
          <div className="mt-3 rounded-md border border-warning/40 bg-warning/10 p-3 text-sm text-warning">
            {result.permits.state_avoid_include.avoided_transited.length > 0 && (
              <p>Avoided state(s) transited: {result.permits.state_avoid_include.avoided_transited.join(", ")}</p>
            )}
            {result.permits.state_avoid_include.required_missed.length > 0 && (
              <p>Required state(s) not transited: {result.permits.state_avoid_include.required_missed.join(", ")}</p>
            )}
            {result.permits.fir_avoid_include.avoided_transited.length > 0 && (
              <p>Avoided FIR(s) transited: {result.permits.fir_avoid_include.avoided_transited.join(", ")}</p>
            )}
            {result.permits.fir_avoid_include.required_missed.length > 0 && (
              <p>Required FIR(s) not transited: {result.permits.fir_avoid_include.required_missed.join(", ")}</p>
            )}
            {result.reroute?.found && (
              <p className="mt-1 text-fg/70">
                Alternate route adds ~{result.reroute.extra_distance_nm?.toFixed(0)} NM
                {result.reroute.extra_time_hours && ` (+${result.reroute.extra_time_hours.toFixed(1)} h)`}.
              </p>
            )}
            {result.reroute && !result.reroute.found && <p className="mt-1 text-fg/70">No viable alternate route found.</p>}
          </div>
        )}
      </section>

      <section>
        <h3 className="mb-2 text-sm font-semibold text-fg/70">Permits &amp; services</h3>
        {result.permits.overflight_permits.length === 0 && result.permits.landing_permits.length === 0 ? (
          <p className="text-sm text-fg/50">No permits required.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {result.permits.overflight_permits.map((p) => (
              <li key={`ovf-${p.country_iso3}`} className="flex items-center justify-between gap-2">
                <span>Overflight — {p.country_name}</span>
                <StatusChip status={p.deadline.deadline_status} />
              </li>
            ))}
            {result.permits.landing_permits.map((p) => (
              <li key={`ldg-${p.country_iso3}`} className="flex items-center justify-between gap-2">
                <span>Landing — {p.country_name}</span>
                <StatusChip status={p.deadline.deadline_status} />
              </li>
            ))}
            {result.permits.ground_handling_orders.map((g) => (
              <li key={`gh-${g.country_iso3}`} className="flex items-center justify-between gap-2">
                <span>Ground handling — {g.country_name}</span>
                <StatusChip status={g.deadline.deadline_status} />
              </li>
            ))}
          </ul>
        )}
        {result.permits.service_requirements.length > 0 && (
          <p className="mt-2 text-xs text-fg/50">
            {result.permits.service_requirements.length} ground service line items required across the route.
          </p>
        )}
      </section>

      <section>
        <h3 className="mb-2 text-sm font-semibold text-fg/70">Capability</h3>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <StatusChip status={result.capability.planning_status} />
          {result.capability.exceeds !== null && (
            <span className={result.capability.exceeds ? "text-danger" : "text-fg/60"}>
              {result.capability.exceeds ? "Exceeds practical range" : "Within practical range"}
              {result.capability.margin_nm !== null && ` (margin ${result.capability.margin_nm.toFixed(0)} NM)`}
            </span>
          )}
        </div>
        {result.capability.tech_stop_suggestions.length > 0 && (
          <div className="mt-2">
            <p className="mb-1 text-xs text-fg/50">Suggested technical stops:</p>
            <ul className="space-y-1 text-sm">
              {result.capability.tech_stop_suggestions.map((t) => (
                <li key={t.icao} className="mono-figures">
                  {t.icao} {t.name && `— ${t.name}`} (+{t.added_distance_nm.toFixed(0)} NM)
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {result.nav_fees && (
        <section>
          <h3 className="mb-2 text-sm font-semibold text-fg/70">Navigation fees</h3>
          {result.nav_fees.fully_priced && result.nav_fees.total_usd !== null ? (
            <>
              <p className="mono-figures text-sm">
                Estimated total: ${result.nav_fees.total_usd.toLocaleString(undefined, { maximumFractionDigits: 2 })}
              </p>
              <p className="mt-1 text-xs text-fg/50">Itemized per-country breakdown is available once this trip is built in Trip Manager.</p>
            </>
          ) : (
            <p className="text-sm text-fg/50">
              Not available yet — one or more overflown FIRs have no verified navigation fee rate on file.
            </p>
          )}
        </section>
      )}

      {result.permit_fees && (
        <section>
          <h3 className="mb-2 text-sm font-semibold text-fg/70">Permit &amp; CAA fees</h3>
          {result.permit_fees.fully_priced && result.permit_fees.total_usd !== null ? (
            <>
              <p className="mono-figures text-sm">
                Estimated total: ${result.permit_fees.total_usd.toLocaleString(undefined, { maximumFractionDigits: 2 })}
              </p>
              <p className="mt-1 text-xs text-fg/50">Itemized per-country breakdown is available once this trip is built in Trip Manager.</p>
            </>
          ) : (
            <p className="text-sm text-fg/50">
              Not available yet — one or more permits have no verified CAA/nafisat fee rate on file.
            </p>
          )}
        </section>
      )}

      {result.credentials.persons.length > 0 && (
        <section>
          <h3 className="mb-2 text-sm font-semibold text-fg/70">Crew &amp; pax</h3>
          <ul className="space-y-1 text-sm">
            {result.credentials.persons.map((p) => (
              <li key={p.person_id} className="flex items-center justify-between gap-2">
                <span>
                  {p.role} — <CountryName iso3={p.nationality_iso3} />
                </span>
                <span className="text-fg/60">{p.visa_requirement.replace(/_/g, " ")}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-fg/50">
            Souls on board: {result.credentials.souls_on_board_total}
            {result.credentials.souls_on_board_exceeds_max_pax && <span className="ml-1 text-danger">exceeds max pax</span>}
          </p>
        </section>
      )}
    </div>
  );
}
