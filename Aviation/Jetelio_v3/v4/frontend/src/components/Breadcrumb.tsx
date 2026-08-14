import Link from "next/link";

export interface BreadcrumbItem {
  label: string;
  href?: string; // omit on the last item — it's the current page, not a link
}

// Shared wayfinding for any page nested under a list (Trip/Operator/Person/
// Party detail, etc.) — replaces the old plain "← Operators" back link with
// a real location trail, same fg/50-hover-fg/80 treatment that link already
// used, so it's a visual continuation, not a new pattern.
export function Breadcrumb({ items }: { items: BreadcrumbItem[] }) {
  return (
    <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1.5 text-sm text-fg/50">
      {items.map((item, i) => {
        const isLast = i === items.length - 1;
        return (
          <span key={`${item.label}-${i}`} className="flex items-center gap-1.5">
            {item.href && !isLast ? (
              <Link href={item.href} className="hover:text-fg/80">
                {item.label}
              </Link>
            ) : (
              <span aria-current={isLast ? "page" : undefined} className={isLast ? "text-fg/80" : undefined}>
                {item.label}
              </span>
            )}
            {!isLast && (
              <span aria-hidden="true" className="text-fg/30">
                /
              </span>
            )}
          </span>
        );
      })}
    </nav>
  );
}
