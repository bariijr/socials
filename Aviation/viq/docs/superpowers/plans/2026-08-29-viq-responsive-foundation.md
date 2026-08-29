# VIQ Responsive Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the app's two most-reused layout patterns (master-detail two-pane, dense list/table) real desktop/tablet/mobile behavior, plus fix a confirmed mobile-breaking gap in the New Trip Wizard and verify the Action Board dashboard.

**Architecture:** One new shared `MasterDetailShell` component (desktop/tablet side-by-side, mobile collapses to a bottom Sheet using an already-scaffolded-but-unused shadcn component) replacing the hand-rolled two-pane shell in `AdminTrips.tsx` and each of `AdminAssets.tsx`'s 9 tabs. One small change to the existing `useViewMode` hook makes every page's "Details" view choice degrade to Tile below mobile width automatically, with zero changes needed in the 9+ pages that call it. `NewTripWizard.tsx` gets responsive prefixes added to its hardcoded grids. `Dashboard.tsx` gets a verification-only pass.

**Tech Stack:** React + TypeScript + Tailwind (default breakpoints) + shadcn/ui (Radix-backed `Sheet` component, already a dependency, currently unused).

**Spec:** `docs/superpowers/specs/2026-08-29-viq-responsive-foundation-design.md`

## Global Constraints

- Breakpoints are Tailwind's defaults, already used throughout this codebase: mobile = below `md` (768px), tablet = `md` to just under `lg` (768–1023px), desktop = `lg`+ (≥1024px). Never introduce custom breakpoint values.
- No new npm packages — `@radix-ui/react-dialog` (which `src/client/components/ui/sheet.tsx` wraps) is already a dependency.
- After any client-side edit, run `npm run build:client` (not `build:server` alone) before calling a task done, per this project's established workflow — there is no separate dev-server hot-reload check required, but do start/use the running app at `http://localhost:4001` for the live-browser verification steps.
- No automated test suite exists in this project. Verification is `tsc --noEmit` + a full client build + live browser checks at real viewport widths.
- Tablet keeps the master-detail pattern's two panes visible side by side (just narrower) — tablet does NOT get the same Bottom Sheet treatment as mobile. This is a firm, already-confirmed decision; do not conflate the two.
- The dense-table "Details" view choice stays selectable at every width (never hidden or disabled) — it just renders differently below mobile width.

---

## Task 1: `useMediaQuery` hook

**Files:**
- Create: `src/client/hooks/useMediaQuery.ts`

**Interfaces:**
- Produces: `useMediaQuery(query: string): boolean` — a React hook returning whether the given CSS media query currently matches, updating on viewport resize. Consumed by Task 2 (`MasterDetailShell`) and Task 5 (`useViewMode`).

- [ ] **Step 1: Write the hook**

Create `src/client/hooks/useMediaQuery.ts`:

```typescript
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
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc -p tsconfig.client.json --noEmit`
Expected: no errors (this file isn't imported anywhere yet, so this only confirms it compiles standalone).

- [ ] **Step 3: Commit**

```bash
git add src/client/hooks/useMediaQuery.ts
git commit -m "Add useMediaQuery hook"
```

---

## Task 2: `MasterDetailShell` component

**Files:**
- Create: `src/client/components/ui/master-detail-shell.tsx`

**Interfaces:**
- Consumes: `useMediaQuery` from `@/hooks/useMediaQuery` (Task 1); `Sheet`, `SheetContent`, `SheetHeader`, `SheetTitle` from `@/components/ui/sheet` (already exists, unused — do not modify that file); `cn` from `@/lib/utils`.
- Produces: `<MasterDetailShell list detail detailOpen onDetailOpenChange detailTitle? listWidthClassName? heightClassName? />` — consumed by Task 3 (`AdminTrips.tsx`) and Task 4 (`AdminAssets.tsx`'s 9 tabs).

- [ ] **Step 1: Write the component**

Create `src/client/components/ui/master-detail-shell.tsx`:

```tsx
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
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc -p tsconfig.client.json --noEmit`
Expected: no new errors from this file (not imported anywhere yet).

- [ ] **Step 3: Commit**

```bash
git add src/client/components/ui/master-detail-shell.tsx
git commit -m "Add MasterDetailShell component"
```

---

## Task 3: Migrate `AdminTrips.tsx` onto `MasterDetailShell`

**Files:**
- Modify: `src/client/pages/admin/AdminTrips.tsx`

**Interfaces:**
- Consumes: `MasterDetailShell` from `@/components/ui/master-detail-shell` (Task 2).

- [ ] **Step 1: Import `MasterDetailShell`**

Add near the top of `AdminTrips.tsx`, alongside its other `@/components/ui/*` imports:

```typescript
import { MasterDetailShell } from '@/components/ui/master-detail-shell';
```

- [ ] **Step 2: Replace the outer two-pane markup**

`AdminTrips.tsx`'s `return` statement currently looks like this (the outer structure — the actual left-pane and right-pane JSX inside stays word-for-word identical, only the two outer wrapping `<div>`s change):

```tsx
  return (
    <div className="flex h-[calc(100vh-6rem)] gap-4">
      {/* ─── LEFT PANE: Trip List ───────────────────────────────────────── */}
      <div className="flex w-80 flex-col gap-3 overflow-hidden">
        {/* ... existing left-pane JSX, unchanged ... */}
      </div>

      {/* ─── RIGHT PANE: Trip Detail ────────────────────────────────────── */}
      <div className="flex-1 flex flex-col gap-4 overflow-hidden">
        {/* ... existing right-pane JSX, unchanged ... */}
      </div>

      {/* Dialogs */}
      <ServiceEditorDialog ... />
      <AddServiceDialog ... />
      <AddLegDialog ... />
    </div>
  );
```

Replace it with:

```tsx
  return (
    <>
      <MasterDetailShell
        heightClassName="h-[calc(100vh-6rem)]"
        listWidthClassName="md:w-64 lg:w-80"
        detailOpen={!!selectedTripId}
        onDetailOpenChange={(open) => { if (!open) setSelectedTripId(null); }}
        detailTitle={selectedTrip?.TripID}
        list={
          <div className="flex h-full flex-col gap-3 overflow-hidden">
            {/* ... existing left-pane JSX, unchanged, EXCEPT drop the
                outer div's own `w-80` class since MasterDetailShell now
                owns list width — use `h-full` instead as shown above ... */}
          </div>
        }
        detail={
          <div className="flex h-full flex-col gap-4 overflow-hidden">
            {/* ... existing right-pane JSX, unchanged, EXCEPT drop
                `flex-1` from the outer div since MasterDetailShell's own
                wrapper already provides flex-1/full-width sizing ... */}
          </div>
        }
      />

      {/* Dialogs — unchanged, moved outside MasterDetailShell since they're
          modals independent of the responsive shell */}
      <ServiceEditorDialog ... />
      <AddServiceDialog ... />
      <AddLegDialog ... />
    </>
  );
```

Concretely: the left pane's outer `<div className="flex w-80 flex-col gap-3 overflow-hidden">` becomes `<div className="flex h-full flex-col gap-3 overflow-hidden">` (drop `w-80`, add `h-full`) and moves into the `list` prop. The right pane's outer `<div className="flex-1 flex flex-col gap-4 overflow-hidden">` becomes `<div className="flex h-full flex-col gap-4 overflow-hidden">` (drop `flex-1`, add `h-full`) and moves into the `detail` prop. Everything each div contains stays byte-for-byte the same. The 3 dialogs (`ServiceEditorDialog`, `AddServiceDialog`, `AddLegDialog`) move outside `MasterDetailShell` but stay inside the component's returned fragment, with their own props unchanged.

- [ ] **Step 3: Typecheck and build**

Run: `npx tsc -p tsconfig.client.json --noEmit && npm run build:client`
Expected: no errors referencing `AdminTrips.tsx`.

- [ ] **Step 4: Live browser verification**

Navigate to `/admin/trips` at desktop width (≥1024px) — confirm it looks and behaves exactly as before (list ~320px + detail pane, no visual change). Narrow the browser to tablet width (768–1023px) — confirm both panes are still visible, list pane visibly narrower. Narrow further to mobile width (<768px) — confirm the list takes the full width, selecting a trip opens the detail as a bottom sheet sliding up from the bottom, and dismissing it (the X button or clicking the backdrop) returns to the list with `selectedTripId` cleared.

- [ ] **Step 5: Commit**

```bash
git add src/client/pages/admin/AdminTrips.tsx
git commit -m "Migrate AdminTrips onto MasterDetailShell for responsive layout"
```

---

## Task 4: Migrate `AdminAssets.tsx`'s 9 tabs onto `MasterDetailShell`

**Files:**
- Modify: `src/client/pages/admin/AdminAssets.tsx`

**Interfaces:**
- Consumes: `MasterDetailShell` from `@/components/ui/master-detail-shell` (Task 2).

- [ ] **Step 1: Import `MasterDetailShell`**

Add near the top of `AdminAssets.tsx`, alongside its other `@/components/ui/*` imports:

```typescript
import { MasterDetailShell } from '@/components/ui/master-detail-shell';
```

- [ ] **Step 2: Worked example — the Aircraft tab**

Every one of the 9 tabs currently wraps its `MasterDetailList` + `DetailPanel` pair in an identical shell:

```tsx
        <TabsContent value="aircraft">
          <div className="flex h-[calc(100vh-14rem)] gap-4">
            <MasterDetailList
              title="Aircraft" subtitle={`${aircraft.length} total`} items={aircraft}
              ... (unchanged props)
            />
            <DetailPanel empty={!selectedAircraft && !aircraftSel.adding}>
              {!selectedAircraft && !aircraftSel.adding ? 'Select an aircraft from the left, or add a new one' : (
                <AircraftPanel ... (unchanged props) />
              )}
            </DetailPanel>
          </div>
        </TabsContent>
```

Replace the inner `<div className="flex h-[calc(100vh-14rem)] gap-4">...</div>` with `MasterDetailShell`, moving `MasterDetailList` into `list` and `DetailPanel` into `detail`, verbatim (no prop changes to either):

```tsx
        <TabsContent value="aircraft">
          <MasterDetailShell
            heightClassName="h-[calc(100vh-14rem)]"
            listWidthClassName="md:w-64 lg:w-96"
            detailOpen={!!(aircraftSel.selectedId || aircraftSel.adding)}
            onDetailOpenChange={(open) => { if (!open) aircraftSel.clear(); }}
            detailTitle={selectedAircraft?.Registration ?? (aircraftSel.adding ? 'Add Aircraft' : undefined)}
            list={
              <MasterDetailList
                title="Aircraft" subtitle={`${aircraft.length} total`} items={aircraft}
                ... (unchanged props)
              />
            }
            detail={
              <DetailPanel empty={!selectedAircraft && !aircraftSel.adding}>
                {!selectedAircraft && !aircraftSel.adding ? 'Select an aircraft from the left, or add a new one' : (
                  <AircraftPanel ... (unchanged props) />
                )}
              </DetailPanel>
            }
          />
        </TabsContent>
```

- [ ] **Step 3: Apply the identical transformation to the other 8 tabs**

Each of the remaining 8 `TabsContent` blocks (`value="vendors"`, `"airports"`, `"countries"`, `"persons"`, `"expiry"`, `"operators"`, `"clients"`, `"fees"`) has the exact same shell shape as Aircraft — a `<div className="flex h-[calc(100vh-14rem)] gap-4">` wrapping one `MasterDetailList` and one `DetailPanel`. For each: replace that outer div with `MasterDetailShell` using `heightClassName="h-[calc(100vh-14rem)]"` and `listWidthClassName="md:w-64 lg:w-96"` (identical to Aircraft's), move the tab's own already-existing `MasterDetailList` into `list` and its own already-existing `DetailPanel` into `detail` with zero prop changes to either, and set:

- `detailOpen`/`onDetailOpenChange`: use that tab's own selection object (`vendorSel`, `airportSel`, `countrySel`, `personSel`, `expirySel`, `operatorSel`, `clientSel`, `feeSel` respectively) the same way Aircraft used `aircraftSel` — `detailOpen={!!(xSel.selectedId || xSel.adding)}`, `onDetailOpenChange={(open) => { if (!open) xSel.clear(); }}`, uniformly for all 8, including `expirySel` (it's the same shared `useSelection()` hook everywhere, so `.adding` always exists — it's simply always `false` on the Expiry tab since nothing ever calls `expirySel.startAdd()`, so the expression behaves identically to a bare `!!expirySel.selectedId` there without needing a special case).
- `detailTitle`: the tab's own selected-item display name, matching each tab's own naming field — `selectedProvider?.Name`, `selectedAirport?.ICAO`, `selectedCountry?.Name`, `selectedPerson?.Name`, `selectedExpiry?.person.Name`, `selectedOperator?.Name`, `selectedClient?.Name`, `String(selectedFee?.ID ?? '')` respectively (fall back to an "Add X" string when that tab's own `.adding` flag is true, matching Aircraft's pattern — always false for Expiry, so it only ever shows `selectedExpiry?.person.Name`).

- [ ] **Step 4: Typecheck and build**

Run: `npx tsc -p tsconfig.client.json --noEmit && npm run build:client`
Expected: no errors referencing `AdminAssets.tsx`.

- [ ] **Step 5: Live browser verification**

Navigate to `/admin/assets` at desktop width — confirm every one of the 9 tabs looks unchanged from before this task. Narrow to tablet width — confirm both panes stay visible, list narrower, on at least 3 tabs (Aircraft, Persons, Fees). Narrow to mobile width — confirm the list takes full width and selecting an item opens the bottom sheet, on the same 3 tabs; confirm the Expiry tab's read-only detail also opens correctly as a sheet (it has no Add button, only selection).

- [ ] **Step 6: Commit**

```bash
git add src/client/pages/admin/AdminAssets.tsx
git commit -m "Migrate AdminAssets' 9 tabs onto MasterDetailShell for responsive layout"
```

---

## Task 5: Dense list/table auto-restack via `useViewMode`

**Files:**
- Modify: `src/client/components/ui/view-mode-toggle.tsx`

**Interfaces:**
- Consumes: `useMediaQuery` from `@/hooks/useMediaQuery` (Task 1).
- Produces: `useViewMode` keeps its existing signature (`useViewMode(storageKey, fallback): [ViewMode, (mode: ViewMode) => void]`) but the first tuple element now returns `'tile'` instead of the user's stored `'details'` preference when the viewport is below `md` — every existing caller (`ReferencePage.tsx`'s 7 tabs, `AdminAssets.tsx`'s 9 tabs, `UsersPage.tsx`) gets this behavior automatically with no changes to those files, since they all branch on whatever `useViewMode` returns.

- [ ] **Step 1: Modify `useViewMode`**

In `src/client/components/ui/view-mode-toggle.tsx`, add the import:

```typescript
import { useMediaQuery } from '@/hooks/useMediaQuery';
```

Replace the `useViewMode` function:

```typescript
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
  return [effectiveViewMode, setViewMode] as const;
}
```

- [ ] **Step 2: Typecheck and build**

Run: `npx tsc -p tsconfig.client.json --noEmit && npm run build:client`
Expected: no errors — every caller destructures the returned tuple the same way as before, so this is a behavior-only change, not a signature change.

- [ ] **Step 3: Live browser verification**

On `/reference`'s Airports tab, switch the view toggle to Details (the default) at desktop width — confirm the table renders as before. Narrow to mobile width — confirm it automatically shows as Tile cards instead of the table, with the Details icon in the toggle still shown and still clickable (clicking it doesn't error, it's just visually indistinguishable from Tile at this width since both now render Tile). Widen back to desktop — confirm it reverts to showing the actual table again (proving the stored preference was never overwritten). Repeat the narrow-to-mobile check on `/admin/assets`' Persons tab and `/admin/users`.

- [ ] **Step 4: Commit**

```bash
git add src/client/components/ui/view-mode-toggle.tsx
git commit -m "Auto-degrade Details view to Tile below mobile width"
```

---

## Task 6: New Trip Wizard responsive grids

**Files:**
- Modify: `src/client/pages/admin/NewTripWizard.tsx`

- [ ] **Step 1: Add responsive prefixes to every hardcoded grid**

`NewTripWizard.tsx` currently has these exact `grid-cols-N` occurrences with no responsive prefix at all (verify each line number against the live file first — line numbers below were confirmed correct as of this plan's writing, but re-check before editing in case an earlier task's changes to other files somehow triggered a reformat; they shouldn't have, since no other task in this plan touches this file):

- Line 74: `grid grid-cols-2 gap-3` → `grid grid-cols-1 sm:grid-cols-2 gap-3`
- Line 96: `grid grid-cols-2 gap-3` → `grid grid-cols-1 sm:grid-cols-2 gap-3`
- Line 114: `grid grid-cols-3 gap-3` → `grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3`
- Line 203: `grid grid-cols-2 gap-3` → `grid grid-cols-1 sm:grid-cols-2 gap-3`
- Line 224: `grid grid-cols-2 gap-3` → `grid grid-cols-1 sm:grid-cols-2 gap-3`
- Line 270: `grid grid-cols-2 gap-3` → `grid grid-cols-1 sm:grid-cols-2 gap-3`
- Line 289: `grid grid-cols-2 gap-3` → `grid grid-cols-1 sm:grid-cols-2 gap-3`
- Line 635: `grid grid-cols-2 gap-4` → `grid grid-cols-1 sm:grid-cols-2 gap-4`
- Line 667: `grid grid-cols-3 gap-4` → `grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4`
- Line 709: `grid grid-cols-3 gap-4` → `grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4`
- Line 756: `grid grid-cols-4 gap-2` → `grid grid-cols-2 sm:grid-cols-4 gap-2` (this one starts at 2 columns even on mobile rather than 1 — checked live, it's a short label+checkbox list of service-type toggles that reads fine 2-up even on a narrow phone; 1-per-row would make an already-long list far too tall)
- Line 866: `grid grid-cols-3 gap-4` → `grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4`

For each: change only the `className` string's grid-column classes exactly as shown above (add `grid-cols-1` or `grid-cols-2` as the base/mobile value, keep the existing value gated behind the `sm:`/`lg:` prefix shown). Nothing else in each line changes.

- [ ] **Step 2: Typecheck and build**

Run: `npx tsc -p tsconfig.client.json --noEmit && npm run build:client`
Expected: no errors referencing `NewTripWizard.tsx`.

- [ ] **Step 3: Live browser verification**

Start a new trip (`/admin/trips/new` or the "New Trip" button on `/admin/trips`). At desktop width, confirm every step still looks exactly as it did before (same column counts). Narrow to mobile width and step through the wizard — confirm no section's fields overflow horizontally or get cut off; the service-type checkbox grid (line 756) should show 2 per row, not 4 crammed into a phone-width screen. Narrow to tablet width and spot-check at least 2 of the 3-column sections show 2 columns.

- [ ] **Step 4: Commit**

```bash
git add src/client/pages/admin/NewTripWizard.tsx
git commit -m "Add responsive grid breakpoints to New Trip Wizard"
```

---

## Task 7: Action Board verification pass

**Files:**
- Modify: `src/client/pages/Dashboard.tsx` (only if a real issue is found — see Step 2)

- [ ] **Step 1: Live browser verification**

Navigate to `/dashboard` at desktop width (≥1024px) — confirm the layout looks correct (it already uses `md:grid-cols-4`/`md:grid-cols-2`, so this is a sanity check, not expected to find anything). Narrow to tablet width (768–1023px) — confirm the `md:` breakpoints have taken effect (grids should already be collapsing per their existing classes) and nothing overlaps or overflows. Narrow to mobile width (<768px) — confirm every card/section stacks to a single column with no horizontal overflow, no cut-off text, no overlapping elements.

- [ ] **Step 2: Fix only what's actually broken**

If Step 1 finds a real visual defect (overflow, overlap, cut-off content, a card that doesn't stack when it should), fix it with the minimal targeted change — most likely a missing `md:`/`sm:` prefix on one specific element, following the same pattern as the grids already in this file. Do not restructure or redesign anything that already works. If Step 1 finds nothing wrong, skip straight to Step 3 with no code change.

- [ ] **Step 3: If Step 2 made a change, typecheck, build, and re-verify**

Run: `npx tsc -p tsconfig.client.json --noEmit && npm run build:client`, then repeat the 3-width check from Step 1 to confirm the fix worked and introduced no new issue.

- [ ] **Step 4: Commit (only if Step 2 made a change)**

```bash
git add src/client/pages/Dashboard.tsx
git commit -m "Fix [specific issue found] on Action Board at [breakpoint] width"
```

If no change was needed, skip this step — there is nothing to commit for this task, and that's a valid, complete outcome.

---

## Task 8: Full verification pass

**Files:** none (verification only)

- [ ] **Step 1: Full clean build**

Run: `npm run build`
Expected: both `build:server` and `build:client` succeed with zero TypeScript errors.

- [ ] **Step 2: Confirm the app is running**

The app should already be running at `http://localhost:4001` from this session's prior work — confirm with `curl -s -o /dev/null -w "%{http_code}" http://localhost:4001` returning `200` before starting live checks. If it isn't running, start it per this project's existing dev workflow.

- [ ] **Step 3: Cross-cutting live verification at all three widths**

For each of `/admin/trips`, `/admin/assets` (spot-check 3 of its 9 tabs), `/reference` (spot-check 3 of its 7 tabs), and `/admin/users`: load at desktop width, resize the actual browser window (not just DevTools' device toolbar) down through tablet width to mobile width and back up, confirming at each stop: no horizontal page scrollbar, no overlapping elements, the master-detail pages correctly switch between side-by-side and bottom-sheet behavior at the `md` boundary, and the dense-list pages' Details view correctly switches to Tile below `md` and back.

- [ ] **Step 4: Update the project README changelog**

Add a dated section to `README.md` (matching this project's established per-feature changelog convention) documenting: the new `MasterDetailShell`/`useMediaQuery` components, which pages now migrated onto them, the `useViewMode` auto-degrade behavior, and the New Trip Wizard grid fix. Note this is sub-project 1 of the responsive-UI initiative — Billing, Settings, and other one-off pages are separate, not-yet-started follow-ups, the same way it's noted in the design spec.

- [ ] **Step 5: Final commit**

```bash
git add README.md
git commit -m "Document responsive foundation work in README"
```
