const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function pad2(n) {
  return String(n).padStart(2, '0');
}

export function formatDateOnlyZ(iso) {
  if (!iso) return 'TBD';
  const d = new Date(iso);
  return `${pad2(d.getUTCDate())}-${MONTHS[d.getUTCMonth()]}-${d.getUTCFullYear()}`;
}

export function formatDateTimeZ(iso) {
  if (!iso) return 'TBD';
  const d = new Date(iso);
  return `${formatDateOnlyZ(iso)} ${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}Z`;
}

export function countryNameFor(iso2, countries) {
  const country = countries.find((c) => c.iso2 === iso2);
  return country ? country.name : iso2;
}
