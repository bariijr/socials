export function filterTrips(trips, searchQuery, statusFilter) {
  const q = (searchQuery || '').trim().toLowerCase();
  return trips.filter((t) => {
    const matchesQuery =
      q === '' ||
      t.tripCode.toLowerCase().includes(q) ||
      t.clientOperator.toLowerCase().includes(q) ||
      t.registration.toLowerCase().includes(q);
    const matchesStatus = statusFilter === 'ALL' || t.status === statusFilter;
    return matchesQuery && matchesStatus;
  });
}
