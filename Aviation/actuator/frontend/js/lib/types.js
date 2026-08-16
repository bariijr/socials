/**
 * Domain shapes used across this plan (documented once here, not re-declared per file — plain JS, no compile-time enforcement, but every mock-data and store file below conforms to these):
 *
 * Airport      { icao, iata, name, country, iso2, tz }
 * Country      { name, iso2, region, overflightPermitRequired, landingPermitRequired, aocDocsRequired, defaultEscalationContact }
 * CountryRule  { id, countryIso2, serviceType, leadTimeHours, workingDaysOnly, toleranceHours, docsRequired: string[], escalationContact, notes? }
 * Aircraft     { registration, icaoType, manufacturer, series, mtowKg, noiseCert }
 * Provider     { id, name, serviceType, scopeIso2?, scopeIcao?, email, aogContact, workingHoursZ }
 * PersonRole   { id, label }
 * Trip         { id, tripCode, clientOperator, registration, ownerName, status, notifyRecipients: string[], createdAtZ }
 * Person       { id, tripId, name, roleId, notes?, removed? }   // trip-level roster, not per-leg; `removed` is a
 *              // soft-delete flag — kept (not spliced out) so a removed person's audit trail
 *              // stays reachable from the trip's History tab via recordId.
 * Leg          { id, tripId, sequence, callSign, depIcao, arrIcao, etdZ, etaZ, overflightCountries: string[], revision }
 *              // etdZ is always a known ISO string; etaZ is `string | null` — null means "TBD" (a real, common state
 *              // for a return leg whose arrival time isn't known yet). No pax/crew fields — see Person/roster instead.
 * Stop         { id, tripId, icao, arrZ, depZ, groundTimeHours, purpose }   // purpose: 'TURNAROUND' | 'TECH_STOP' | 'NIGHT_STOP'
 *              // arrZ/groundTimeHours are null when the feeding leg's etaZ is null — the stop still exists, its time just isn't known yet.
 * Service      { id, tripId, scopeType, scopeId, serviceType, providerId, status, refNumber, basedOnEtdZ, assignedTo }
 *              // scopeType: 'LEG' | 'STOP' | 'SEGMENT'; scopeId for SEGMENT is "<legId>:<countryIso2>"
 *              // status: 'NOT_REQUIRED' | 'NOT_STARTED' | 'REQUESTED' | 'CHASING' | 'CONFIRMED' | 'RECONFIRM_REQUIRED' | 'CANCELLED'
 * Comm         { id, tripId, serviceId, direction, kind, token, from, to: string[], subject, body, timestampZ }
 *              // direction: 'IN' | 'OUT'; kind: 'REQUEST' | 'NOTIFICATION' | 'CANCEL'
 * AuditEntry   { id, timestampZ, user, table, recordId, field, oldValue, newValue }
 */
