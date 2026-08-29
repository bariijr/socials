import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { LayoutGrid, List, Grid2X2, Grid3X3 } from 'lucide-react';
import { useMediaQuery } from '@/hooks/useMediaQuery';

export type ViewMode = 'tile' | 'details' | 'large' | 'small';

const VIEW_MODES: { mode: ViewMode; label: string; icon: typeof LayoutGrid }[] = [
  { mode: 'tile', label: 'Tile', icon: LayoutGrid },
  { mode: 'large', label: 'Large Icons', icon: Grid2X2 },
  { mode: 'small', label: 'Small Icons', icon: Grid3X3 },
  { mode: 'details', label: 'Details', icon: List },
];

// Shared across every list on Trips/AdminTrips/Reference Data/Assets/Users —
// one persisted preference per list (storageKey), so switching view on one
// list doesn't affect another.
export function useViewMode(storageKey: string, fallback: ViewMode = 'tile') {
  const [viewMode, setViewModeState] = useState<ViewMode>(() => {
    try { return (localStorage.getItem(storageKey) as ViewMode) || fallback; } catch { return fallback; }
  });
  const setViewMode = (mode: ViewMode) => {
    setViewModeState(mode);
    try { localStorage.setItem(storageKey, mode); } catch { /* private-browsing / storage blocked — just won't persist */ }
  };
  // Below md (768px), "Details" mode's raw <Table> markup (used in several
  // pages, e.g. ReferencePage.tsx) doesn't fit — auto-degrade to Tile on
  // narrow viewports without touching the user's actual stored preference,
  // so it reverts to their real choice the moment they widen the window.
  // Every caller of this hook gets this for free; nothing else changes.
  const isMobile = !useMediaQuery('(min-width: 768px)');
  const effectiveViewMode = viewMode === 'details' && isMobile ? 'tile' : viewMode;
  // Third element is the raw, never-degraded stored preference — use this
  // (not the effective mode) to drive the ViewModeToggle UI's highlighted
  // state, so the toggle always reflects what the user actually chose, even
  // while the render branch above is using the degraded effective mode.
  return [effectiveViewMode, setViewMode, viewMode] as const;
}

export function ViewModeToggle({ value, onChange }: { value: ViewMode; onChange: (mode: ViewMode) => void }) {
  return (
    <div className="flex items-center rounded-md border p-0.5 shrink-0">
      {VIEW_MODES.map(({ mode, label, icon: Icon }) => (
        <Button
          key={mode}
          type="button"
          size="icon-sm"
          variant={value === mode ? 'default' : 'ghost'}
          title={label}
          aria-label={label}
          onClick={() => onChange(mode)}
        >
          <Icon className="h-4 w-4" />
        </Button>
      ))}
    </div>
  );
}
