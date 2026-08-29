import { useEffect, useState } from 'react';

// Tracks a CSS media query's match state, updating on viewport resize —
// the one place in the client that reads breakpoint state in JS (every
// other responsive behavior in this app is pure CSS via Tailwind
// prefixes). Needed only where a component must make a structural
// decision CSS alone can't express, like which of two rendered subtrees
// actually receives interaction (see MasterDetailShell).
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(query).matches : false
  );

  useEffect(() => {
    const mql = window.matchMedia(query);
    const handler = (e: MediaQueryListEvent) => setMatches(e.matches);
    setMatches(mql.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, [query]);

  return matches;
}
