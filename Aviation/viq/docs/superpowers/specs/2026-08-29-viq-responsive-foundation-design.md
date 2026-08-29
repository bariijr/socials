# VIQ Responsive Foundation (Desktop/Tablet/Mobile)

## Context

VIQ has never had a systematic desktop/tablet/mobile strategy. What exists
today is ad hoc: the app shell already has a mobile nav treatment (hamburger
+ slide-over sidebar behind `md:hidden`, built in an earlier session), and
scattered `md:`/`sm:`/`lg:` classes already appear 58/42/19 times across the
client — but the two structural patterns most of the admin app is built on
have **zero** responsive treatment:

- **The master-detail two-pane layout** (`AdminTrips.tsx`, and all 9 of
  `AdminAssets.tsx`'s tabs, built earlier this session via the shared
  `MasterDetailList`/`EntityListCard` components) uses fixed-width panes
  (`w-80`/`w-96` list + `flex-1` detail, `h-[calc(100vh-Xrem)]`) with no
  stacking or drawer fallback — on a narrow viewport both panes just
  cram into whatever space exists.
- **Dense list/table views** — Reference Data's 7 tabs, Users, and every
  page's "Details" view-mode option — either render a raw `<Table>` (no
  responsive fallback at all) or, where `EntityListCard` is used
  (Tile/Large/Small modes), only "Details" mode still falls back to the
  original hand-written table markup per page.

A real gap was also found in `NewTripWizard.tsx` during brainstorming:
several sections use hardcoded `grid-cols-2`/`grid-cols-3`/`grid-cols-4`
with **no** responsive prefixes at all — one is a bare `grid-cols-4`
(`NewTripWizard.tsx:756`), which crams 4 columns onto a phone screen
today. `Dashboard.tsx`, by contrast, already uses `md:grid-cols-4`/
`md:grid-cols-2` (defaulting to 1 column below `md`) — it needs a
verification pass, not a rebuild.

This is sub-project 1 of an open-ended "give the app a real desktop/
tablet/mobile UI/UX" initiative. Confirmed during brainstorming: this
sub-project covers the two shared structural patterns (master-detail,
dense list/table) plus the New Trip Wizard and Action Board dashboard —
Billing, Settings, and any other one-off pages are explicitly deferred to
later sub-projects, decided one at a time the same way this one was.

Confirmed with the user during brainstorming (including two rounds with
the visual companion, comparing mockups in-browser):

- **Breakpoints**: Tailwind's defaults, already in use throughout this
  codebase — no config changes. Mobile = below `md` (768px). Tablet =
  `md` to just under `lg` (768–1023px). Desktop = `lg`+ (≥1024px).
- **Master-detail below desktop**: tablet gets a *narrower* version of
  the same two-pane layout (list pane shrinks from `w-80`/`w-96` to
  roughly `w-64`, both panes still visible side by side) — not the same
  treatment as mobile. Below `md`, it collapses to a **Bottom Sheet**:
  the list stays visible full-width; tapping an item slides the detail/
  edit panel up as a sheet over it, dismissible back to the list without
  losing scroll position. (Two other options — full-screen "Stack"
  navigation, and a top tab switcher — were mocked up and rejected in
  favor of Bottom Sheet.)
- **Dense list/table below mobile**: stays fully selectable at every
  width (unlike the master-detail case, this isn't gated to a narrower
  desktop treatment on tablet — tablet keeps the normal table). Below
  `md`, "Details" mode auto-restacks each row as a small stacked card
  instead of a horizontally-scrolling or hidden table. (Hiding the
  Details option entirely, and keeping it with horizontal scroll, were
  mocked up and rejected in favor of auto-restack.)

## Goal

Every page built on the master-detail or dense-list/table pattern, plus
the New Trip Wizard and Action Board dashboard, renders correctly and
usably at mobile, tablet, and desktop widths — verified at real viewport
widths, not just DevTools guesses.

## Design decisions

- **Master-detail: `MasterDetailList` gains the responsive behavior, not
  each page individually.** Both `AdminTrips.tsx` (which predates and
  isn't built on `MasterDetailList`) and `AdminAssets.tsx`'s 9 tabs
  (which are) need this, so the layout-shell logic — not the list-item
  rendering `MasterDetailList` already handles — moves into a new shared
  wrapper component both pages use for their outer list+detail
  structure. `AdminTrips.tsx` gets migrated onto this wrapper as part of
  this work (it currently hand-rolls the same `flex w-80 ... / flex-1
  ...` shell that `AdminAssets.tsx`'s 9 tabs each repeat inline).
- **Bottom Sheet uses the `Sheet` component already sitting in this
  codebase, currently unused.** `src/client/components/ui/sheet.tsx`
  is a complete shadcn/Radix-backed component already supporting
  `side="bottom"` (verified: slide-up animation, backdrop, dismiss
  handling all present) — no new package, no new primitive to build,
  just the first real usage of a component that was already scaffolded.
- **Dense list/table: the auto-restack is "force Tile mode below
  mobile," not a new row-to-card transformer.** `ReferencePage.tsx`'s
  "Details" mode currently renders each tab's own hand-written `<Table>`
  while Tile/Large/Small already route through `EntityListCard`. Below
  `md`, the page ignores the user's stored view-mode preference for
  Details specifically and renders Tile instead — reusing existing,
  already-tested card rendering rather than building new markup. This
  applies everywhere `ViewModeToggle`/`useViewMode` is used (Reference
  Data's 7 tabs, Users, and `AdminAssets`'s tabs, which already support
  Tile as an alternative to Details).
- **New Trip Wizard**: mechanical fix — every hardcoded `grid-cols-N`
  identified in brainstorming gets a responsive prefix chain
  (`grid-cols-1 sm:grid-cols-2 lg:grid-cols-N`, adjusted per section's
  actual field count) so nothing overflows below desktop width. No
  structural change to the wizard's step flow.
- **Action Board dashboard**: verification-only in this sub-project —
  live-checked at all three breakpoints; any small polish found
  (spacing, card overflow) fixed inline, but no rebuild expected given
  its `md:` classes already exist.

## Out of scope for this sub-project

- Billing, Settings, and any other page not built on the master-detail
  or dense-list/table pattern — future sub-projects.
- `TripDetail.tsx`'s own bespoke layout (it's neither master-detail nor
  a dense list) — not addressed here.
- Any change to the existing mobile app-shell nav (hamburger/sidebar) —
  already built, working, out of scope.
- Native app / PWA-specific behavior beyond what responsive CSS already
  covers.

## Testing / verification

- `npx tsc -p tsconfig.client.json --noEmit` and a full client build
  after the changes, per this project's established workflow.
- Live browser verification at three real viewport widths (not
  DevTools-only) for: AdminTrips and at least 3 of AdminAssets' 9 tabs
  (Bottom Sheet open/select/dismiss at mobile width, narrowed two-pane
  at tablet width, unchanged at desktop width); at least 3 of Reference
  Data's tabs plus Users (Details mode auto-restacks below mobile width,
  unaffected at tablet/desktop); New Trip Wizard's multi-column sections
  at all three widths; Action Board at all three widths.
