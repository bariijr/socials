import { useState, useMemo, type ReactNode } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { Search, Plus } from 'lucide-react';
import { ViewModeToggle, useViewMode, type ViewMode } from './view-mode-toggle';

// Shared left-pane list for every master-detail page (AdminTrips-style):
// search + view-mode toggle + a card/row per item, driving a persistent
// right-pane detail/edit panel instead of a per-item modal dialog.
export function MasterDetailList<T>({
  title, subtitle, items, getId, searchText, renderItem, viewStorageKey,
  selectedId, onSelect, onAddNew, addLabel, canAdd, emptyText,
}: {
  title: string;
  subtitle?: string;
  items: T[];
  getId: (item: T) => string;
  searchText: (item: T) => string;
  renderItem: (item: T, opts: { viewMode: ViewMode; selected: boolean }) => ReactNode;
  viewStorageKey: string;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onAddNew?: () => void;
  addLabel?: string;
  canAdd?: boolean;
  emptyText?: string;
}) {
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode, viewModeStored] = useViewMode(viewStorageKey, 'tile');
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((i) => searchText(i).toLowerCase().includes(q));
  }, [items, search, searchText]);

  const gridClass =
    viewMode === 'details' ? 'flex flex-col gap-1' :
    viewMode === 'small' ? 'grid grid-cols-2 gap-2' :
    'flex flex-col gap-2';

  return (
    <div className="flex w-full flex-col gap-3 overflow-hidden">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-sm font-bold truncate">{title}</h2>
          {subtitle && <p className="text-xs text-muted-foreground truncate">{subtitle}</p>}
        </div>
        {onAddNew && (
          <Button size="sm" disabled={!canAdd} onClick={() => canAdd && onAddNew()} className="shrink-0">
            <Plus className="h-4 w-4" /> {addLabel || 'Add'}
          </Button>
        )}
      </div>
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <ViewModeToggle value={viewModeStored} onChange={setViewMode} />
      </div>
      <div className={cn('flex-1 overflow-auto pr-1', gridClass)}>
        {filtered.map((item) => {
          const id = getId(item);
          return (
            <div key={id} onClick={() => onSelect(id)} className="cursor-pointer">
              {renderItem(item, { viewMode, selected: selectedId === id })}
            </div>
          );
        })}
        {filtered.length === 0 && (
          <div className="py-8 text-center text-sm text-muted-foreground">{emptyText || 'No items'}</div>
        )}
      </div>
    </div>
  );
}

// Reusable presentational card adapting to the 4 view modes so every entity
// tab (Aircraft/Vendors/Airports/.../Fees) doesn't hand-roll its own 4
// layouts — only the icon/title/subtitle/meta/badges content differs.
export function EntityListCard({
  icon, title, subtitle, meta, badges, viewMode, selected,
}: {
  icon?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  meta?: ReactNode;
  badges?: ReactNode;
  viewMode: ViewMode;
  selected: boolean;
}) {
  const base = cn('transition-colors', selected ? 'border-primary bg-primary/5' : 'hover:bg-accent/50');

  if (viewMode === 'details') {
    return (
      <Card className={base}>
        <CardContent className="flex items-center justify-between gap-2 px-3 py-2">
          <div className="flex min-w-0 items-center gap-2">
            {icon}
            <span className="truncate text-sm font-medium">{title}</span>
            {subtitle && <span className="truncate text-xs text-muted-foreground">{subtitle}</span>}
          </div>
          {badges && <div className="flex shrink-0 items-center gap-1">{badges}</div>}
        </CardContent>
      </Card>
    );
  }

  if (viewMode === 'small') {
    return (
      <Card className={base}>
        <CardContent className="flex flex-col items-center gap-1 p-3 text-center">
          {icon}
          <span className="w-full truncate text-xs font-medium">{title}</span>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={base}>
      <CardContent className={viewMode === 'large' ? 'space-y-2 p-5' : 'space-y-1 p-3'}>
        <div className="flex items-center gap-2">
          {icon}
          <span className={viewMode === 'large' ? 'text-base font-bold' : 'font-bold'}>{title}</span>
        </div>
        {subtitle && <div className="text-sm text-muted-foreground">{subtitle}</div>}
        {meta}
        {badges && <div className="flex flex-wrap gap-1">{badges}</div>}
      </CardContent>
    </Card>
  );
}

// The right-pane shell shared by every detail/edit panel — placeholder when
// nothing is selected, otherwise the caller's form content.
export function DetailPanel({ children, empty }: { children: ReactNode; empty?: boolean }) {
  if (empty) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
        {children}
      </div>
    );
  }
  return (
    <div className="flex-1 space-y-4 overflow-auto pb-4 pl-1 pr-1">
      {children}
    </div>
  );
}
