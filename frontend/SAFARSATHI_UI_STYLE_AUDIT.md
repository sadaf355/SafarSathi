# Safar Sathi UI design system

The UI recreates the five Safar Sathi reference screens (Dashboard, My Bookings, Live Updates, Recovery Options, AI Assistant) as one visual system.

## Tokens
- Colors, type, radii, shadows and motion live in `tailwind.config.js` (`ink`, `canvas`, `line`, `brand`, `safe`, `risk`, `danger`, `ai`).
- Shared surfaces and controls live in `src/index.css` (`.card`, `.btn-*`, `.pill`, `.field`, `.skeleton`).
- Status meaning is centralized in `src/lib/status.ts`: green = on track, amber = at risk, red = delayed/disrupted, blue = recovered, purple = AI.
- Typography: Plus Jakarta Sans for UI, Caveat for the handwritten brand line.

## Structure
- `components/layout`: Sidebar, TopBar (global search, notifications, profile), PageHero, ShellActions (simulate / add booking / support dialogs).
- `components/travel`: DestinationImage, JourneyRoute, RouteMap (Leaflet), TravelCalendar.
- `components/dashboard`, `components/recovery`, `components/ai`: page-level building blocks.
- `lib/journey.ts` normalizes backend trips into stops and legs; `lib/recovery.ts` presents recovery options; `lib/destinationImages.ts` resolves imagery.

## Accessibility
- Every interactive element is a real button or link with a visible `focus-visible` ring.
- Dialogs use the shared `Modal` (focus trap, Escape to close, focus restore, height-capped with internal scroll).
- Segmented controls use `role="radiogroup"` or `role="tablist"`; the map and charts have text alternatives (tooltips, list view, comparison table).
