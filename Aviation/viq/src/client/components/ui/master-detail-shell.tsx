import type { ReactNode } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { cn } from '@/lib/utils';

// Shared responsive shell for every master-detail page (AdminTrips,
// AdminAssets' 9 tabs). Desktop and tablet show list+detail side by
// side — tablet only narrows the list pane via `listWidthClassName`'s
// own responsive classes, it does NOT get the mobile treatment. Below
// md (768px), the list takes the full width and the detail panel opens
// as a bottom sheet instead of sitting inline.
//
// `list` is rendered once. `detail` is rendered twice — once inline for
// md+, once inside the Sheet for mobile — both fed by the same props
// from the caller's lifted state (selection, edit form values, etc.),
// so the two instances can never desync; only one is ever visible via
// the responsive classes / the Sheet's own conditional mount.
export function MasterDetailShell({
  list,
  detail,
  detailOpen,
  onDetailOpenChange,
  detailTitle,
  listWidthClassName = 'md:w-64 lg:w-80',
  heightClassName = 'h-[calc(100vh-6rem)]',
}: {
  list: ReactNode;
  detail: ReactNode;
  detailOpen: boolean;
  onDetailOpenChange: (open: boolean) => void;
  detailTitle?: string;
  listWidthClassName?: string;
  heightClassName?: string;
}) {
  // Gate the Sheet's actual `open` prop on being below md ourselves,
  // rather than relying on a `md:hidden` class on SheetContent alone —
  // SheetOverlay (the fixed black backdrop) isn't part of SheetContent,
  // so CSS-hiding only the content would still leave the backdrop
  // darkening the screen at desktop/tablet widths whenever detailOpen
  // is true.
  const isMobile = !useMediaQuery('(min-width: 768px)');

  return (
    <div className={cn('flex gap-4', heightClassName)}>
      <div className={cn('flex w-full shrink-0 flex-col overflow-hidden', listWidthClassName)}>
        {list}
      </div>
      <div className="hidden flex-1 overflow-auto md:block">
        {detail}
      </div>
      <Sheet open={detailOpen && isMobile} onOpenChange={onDetailOpenChange}>
        <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto">
          {detailTitle && (
            <SheetHeader>
              <SheetTitle>{detailTitle}</SheetTitle>
            </SheetHeader>
          )}
          <div className="overflow-y-auto px-4 pb-4">{detail}</div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
