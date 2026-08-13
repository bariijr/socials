export interface AdminNavLink {
  href: string;
  label: string;
}

// Single source of truth for the admin destination pages — consumed by
// AdminNav (desktop top bar), MobileNav (bottom bar + "More" sheet), and
// nowhere else. Previously 4 independently hand-maintained copies of this
// same list (AdminNav, MobileNav, and page-local <nav> blocks on
// /admin and /admin/data) drifted out of sync with each other (task #99).
export const ADMIN_NAV_LINKS: AdminNavLink[] = [
  { href: "/admin/trips", label: "Trips" },
  { href: "/countries", label: "Countries" },
  { href: "/airports", label: "Airports" },
  { href: "/aircraft", label: "Aircraft" },
  { href: "/operators", label: "Operators" },
  { href: "/vendors", label: "Vendors" },
  { href: "/admin/persons", label: "Persons" },
  { href: "/admin/parties", label: "Parties" },
  { href: "/admin/data", label: "Data Import" },
  { href: "/admin/settings", label: "Settings" },
];
