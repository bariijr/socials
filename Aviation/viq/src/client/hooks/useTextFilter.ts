import { useMemo, useState } from 'react';

export function useTextFilter<T>(rows: T[], getSearchableText: (row: T) => string) {
  const [query, setQuery] = useState('');
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) => getSearchableText(row).toLowerCase().includes(q));
  }, [rows, query, getSearchableText]);
  return { query, setQuery, filtered };
}
