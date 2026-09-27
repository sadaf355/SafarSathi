# SafarSathi — Implementation Checklist

Living tracking document. Every item below traces back to the final PRD, TRD, or Flow doc (v3.0, 27 Sep 2026), the QA walkthrough, the punch-list UX pass, or the HackCelestial 3.0 mandatory addendum. Status reflects **verified code inspection**, not claims — update the checkbox and the note together as work lands, don't just check the box.

Legend: `[x]` verified done · `[~]` partial/in progress (see note) · `[ ]` not started

> **Reconciliation pass — 27 Sep 2026.** This file had drifted well behind the actual repo (it was tracking an earlier build). Re-verified against the shipped code and the real test run: `pytest app/tests/ -q` → **402 passed, 4 skipped** (skips need a reachable Postgres, not a real failure); `npx vitest run` → **161 passed, 0 failed** across 32 files. Several items below marked `[ ]`/`[~]` are actually complete and shipped with tests — flipped in place with a note on what was found, rather than deleted, so this stays a record of what changed. Keep re-verifying this way (grep/read the file or re-run the test) before checking or unchecking anything — don't trust a stale note over the code.

---

## 1. Core Engines & Data Model (PRD §4.1–4.4, TRD §2–4)

- [x] Itinerary modeled as a typed dependency graph (nodes + edges, hard/soft, buffer minutes)
- [x] Interactive dependency graph view for the traveller (React Flow, behind a "Why?" toggle)
- [x] 8 disruption types across 4 booking categories (flight, hotel, transfer, activity)
- [x] Propagation engine: direct + full-graph cascading impact recompute per disruption event
- [x] Continuous proactive buffer-based connection/schedule risk scoring (independent of disruption trigger)
- [x] Recovery engine generates multiple ranked, feasible candidate plans per disruption
- [x] Each candidate carries cost delta, time impact, refund recovered, feasibility, residual risk
- [x] Scoring engine: traveller preferences (cost-vs-speed, disruption-vs-comfort, named priorities) drive a weighted multi-criteria ranking, applied uniformly across disruption types
- [x] Financial/refund engine computes trip-wide exposure and per-candidate refund recovered
- [x] Comparison UI: cost/time/comfort/bookings-preserved shown per candidate, score-breakdown bars expand inline on the live Recovery Center card
- [x] Selecting a plan persists its actions onto the trip's nodes; itinerary updates in place
- [x] Explicit human confirmation required before any booking change applies (manual UI and Sathi ActionCard alike)
- [x] Repeated/mid-trip disruption support (`latest_unresolved()` reasons from current, not original, state)
- [x] Determinism: identical input always produces identical propagation/risk/ranking output; no hardcoded scores
- [x] Weather modeled as a first-class **disruption type** — `WEATHER_DISRUPTION = "weather-disruption"` is in `app/models/enums.py::DisruptionType`, wired through the propagation engine (`propagation_engine.py`), the disruption service's category/label/default-node maps (`disruption_service.py`), and NL extraction (`disruption_extraction.py`); reconciled 27 Sep 2026, was incorrectly marked absent

## 2. Live Weather → Risk Score (this session, TRD §3.1.1)

- [x] `app/providers/weather_provider.py` built: Open-Meteo call, 1.5s timeout, never raises, 10-min cache per (lat 0.1°, lng 0.1°, hour)
- [x] `_blend_live_weather()` in `risk_service.py` blends live severity into `weather_risk`, capped at ±20 from the time-of-day heuristic
- [x] `WEATHER_RISK_ENABLED` feature flag added (default true)
- [x] Test suite forces the flag off via an autouse `conftest.py` fixture — all 402 backend tests stay deterministic with no network dependency
- [x] `.env.example` documents the new setting
- [x] Framed in the UI/demo narrative as the Digital Twin's environmental input — see §7 A1 (reconciled 27 Sep 2026; this line also had a stale cross-reference to a nonexistent "§5 A1", fixed here too)

## 3. Recovery Coordination Gaps (PRD §4.3, TRD §3.2/§4) — RESOLVED, verify before demo anyway

- [x] `_single_rebook_candidates` (hotel/transfer/activity path) already chains into `_resolve_activity_conflicts` and `_rebook_broken_downstream` exactly like `_flight_candidates` does (`recovery_engine.py` lines ~713–719) — non-flight disruptions get the same coordinated multi-node recovery as the flight path. Directly tested by `test_single_rebook_resolves_activity_conflicts_for_hotel_triggered_disruption` and `test_transfer_and_activity_provider_failures_become_explanatory_plans`. Reconciled 27 Sep 2026 — this was the single biggest gap this checklist claimed was open, and it isn't; **run the hotel/transfer/activity demo path once yourself before presenting** to be sure nothing regressed since this note was written.
- [x] Provider-failure/timeout simulation + graceful "no alternative available" catch exists in all 4 mock providers (`failure_mode="timeout"` raises `ProviderFailureError`, `failure_mode="empty"` returns no alternatives — see `providers/base.py` and each `mock_*_provider.py`), and the recovery engine catches both into an explicit `UNAVAILABLE` plan (`_provider_unavailable_plan`) rather than crashing. Fully covered by `test_provider_failures.py` (7 tests, all passing). Reconciled 27 Sep 2026.

## 4. Frontend Punch List (verified this session, TRD §5)

- [x] Dead components removed and confirmed gone: `MapView.tsx`, `BookingsPage.tsx`, `TripDetail.tsx`, `LiveMonitor.tsx`, `RecoveryCard.tsx`, `RecoveryComparison.tsx`, `AIAssistant.tsx`
- [x] No real `accent-*`/`electric-*`/`ink-*` Tailwind color classes remain; no `glow-*` shadow utilities in `tailwind.config.js`
- [x] Single unified AI surface: TopBar trigger opens `SathiPage` in overlay mode; `✦ SAFARSATHI INSIGHT` + `.ai-surface` used identically across Home, Risk Intelligence, Impact, Sathi chat
- [x] Staged cascade animation in `ImpactAnalysisPanel.tsx` (650ms sequential reveal, fade/slide + `animate-cascade` pulse); dependency graph hidden behind "Why? Show dependency view" toggle; `CountUp` mounts once, not re-triggered
- [x] `RiskIntelligence.tsx`'s `LoadingRisk`: 4 named stages with ✓/●/○ markers
- [x] Sathi "Ask/Act" split: inline `ActionCard` + confirm-before-apply modal
- [x] Recovery Center score-breakdown bars expand inline on the live card (`safar-blue` ring)
- [x] `PageHeader` with breadcrumbs present on all 9 pages
- [x] Real OpenStreetMap iframe + SVG route overlay + live pins on the Journey map (not an abstract projection)
- [x] Live weather pulled from one shared source — Home and Risk Intelligence never disagree
- [x] `MetricCard.tsx` wired into Overview's "Value protected" stat (was defined but unused anywhere)
- [x] Sathi confirm modal: `role="dialog"`, `aria-modal`, `aria-labelledby`/`aria-describedby`, autofocus on open, manual Tab/Shift+Tab focus trap between Cancel/Confirm, focus-visible rings on both buttons
- [x] Fixed: Escape now closes only the topmost open layer (previously closed the whole Sathi panel even mid-confirmation)
- [x] Breadcrumbs keyboard-navigable: "Home"/"More" crumbs are real focusable `<button>`s wired to `onNavigate`/`onBack`, including a new `onBack` prop threaded into `ActivityPage` and `SettingsPage` (previously had no navigation prop at all) via `MorePage`
- [ ] Full keyboard-navigation/focus-visible audit across the *rest* of the app beyond the two items just fixed (only the Sathi confirm modal and PageHeader crumbs have been specifically verified — not a full a11y pass)

## 5. Your 12 Handwritten Limitations (mapped earlier this session)

- [x] 1. Limited whole-trip dependency analysis — solved (core graph engine)
- [x] 2. No transparent dependency graph for travellers — solved (React Flow graph view)
- [x] 3. Alternative booking ≠ complete recovery plan — solved for flight-triggered cascades
- [x] 4. Limited coordinated recovery across flight+hotel+transfer+activities — solved; §3 item 1 above was reconciled 27 Sep 2026, non-flight paths already coordinate the same way the flight path does
- [x] 5. Limited financial exposure calc across all bookings — solved (financial/refund engines)
- [~] 6. Dependency on human intervention for booking changes — deliberate by design (trust), but also no real provider API exists to act on anyway
- [x] 7. Strong focus on flight disruption vs. whole ecosystem — solved; same reconciliation as item 4 above (§3 item 1)
- [ ] 8. Limited proactive prediction before disruption occurs — not addressed (system is reactive; no scheduled prediction job)
- [x] 9. Limited support for repeated disruptions in same trip — solved (`latest_unresolved()` tracking)
- [~] 10. Limited weather/airport/traffic integration into impact — weather now scored (§2), airport/traffic signals still absent entirely
- [x] 11. Need for reproducible/deterministic recovery — solved (explicit acceptance criteria + tests; live-weather blend deliberately capped/cached to preserve this)
- [x] 12. Graceful recovery when provider data unavailable — solved; same reconciliation as §3 item 2 above (timeout/empty-result handling in all 4 mock providers, caught into an explicit UNAVAILABLE plan)

## 6. Intelligence Layer (PRD §4.5) — mostly built, reconciled 27 Sep 2026

- [~] Generative cascade/recovery narrative on the Nugen-aligned model — built and tested for the Digital Twin what-if flow specifically (`nugen_service.explain_weather_cascade` / `mitigation_guidance`, called from `digital_twin_service.py`, tested by `test_twin_uses_nugen_when_configured`); the *general* disruption/recovery narrative (`disruption_service.disruption_narrative`) still runs on the deterministic `recovery_narrative.py` templates, not routed through Nugen. If judges expect every narrative to be Nugen-backed rather than just the what-if one, this is the remaining gap — otherwise A4/B compliance is satisfied as-is.
- [x] Conversational assistant answers questions using current trip state via the Anthropic SDK, with tool-calling (see next item) — not migrated to Nugen, and per the compliance note in §8 that's fine as long as the Digital Twin path (above) carries the mandatory Nugen requirement
- [x] Assistant tool-calling to take recovery actions — Flow F is built: `assistant_service.py` defines `get_impact`, `list_recovery_options`, and `propose_apply_recovery` as Claude tool schemas in a real tool-use loop. By design `propose_apply_recovery` only expresses intent — it never calls `apply_recovery()` directly; the actual write still requires the human-confirm endpoint, matching the human-confirmation requirement in §1. Reconciled 27 Sep 2026, was incorrectly marked not built.
- [x] Natural-language disruption reporting (text) — Flow E's text path is built end-to-end: `POST /assistant/extract-disruption` (`api/routes/assistant.py`) → `disruption_extraction.py` → wired into `DisruptionModal.tsx` on the frontend. Reconciled 27 Sep 2026. **Voice input specifically is still NOT built** — no speech-to-text anywhere in the frontend; only the typed free-text path exists, so don't claim "voice" in a demo unless you add it.
- [x] Proactive prediction job for a likely future disruption — real background job: `risk_prediction_service.py::risk_prediction_loop` is an asyncio loop wired into `main.py`'s startup lifespan, re-scoring every trip every `RISK_PREDICTION_INTERVAL_MINUTES` while `RISK_PREDICTION_ENABLED=true`. Tested via `test_risk_prediction_service.py` / `test_risk_prediction_and_logging.py`. Reconciled 27 Sep 2026 — **note the flag defaults to `false`**, so this does nothing until you explicitly set `RISK_PREDICTION_ENABLED=true` in your deployment env (see DEPLOYMENT.md).

## 7. Mandatory Addendum A — Weather-Driven Digital Twin (HackCelestial 3.0)

**Compliance gate — all 4 sub-requirements are independently judged, no partial credit implied.**

- [x] A1. Live weather as an AI model input, framed as Digital Twin input in the UI — a dedicated `DigitalTwinPage.tsx` with `WeatherScenarioSliders.tsx` exists on the frontend; weather is explicitly the twin's input parameter there, not just an internal risk-engine detail. Reconciled 27 Sep 2026 — do a live click-through before the demo to confirm the copy/framing reads the way you want to a judge, since I verified the components exist but didn't render the UI.
- [x] A2. Geospatial map with weather + simulated impact propagation — `DigitalTwinMapOverlay.tsx` exists alongside the live-pin `RouteMap.tsx`/`JourneyRoute.tsx`. Reconciled 27 Sep 2026 — same caveat as A1: confirm the overlay actually shows on a live run, since this note is from reading the component, not watching it render.
- [x] A3. Real-world social/public signal integration — built: `providers/mastodon_signal_provider.py` (Mastodon public hashtag search, zero-auth) + `services/social_signals_service.py`, with a `dataSource: "simulated"`-labeled fallback matching the mock-provider convention, exposed via `api/routes/social_signals.py`. Tested by `test_mastodon_signal_provider.py`. Reconciled 27 Sep 2026 — was incorrectly marked "nothing built."
- [x] A4. Interactive what-if simulation — built: read-only `POST /api/trips/{id}/digital-twin/simulate` (`api/routes/digital_twin.py`) clones the graph in `digital_twin_service.py`, re-runs propagation+risk without persisting, and a companion `POST .../apply` lets the traveller commit a simulation's plan to the real itinerary (with staleness/active-disruption guards). Frontend: `DigitalTwinPage.tsx` + `DigitalTwinComparison.tsx`. Fully tested (`test_digital_twin.py`, 16+ tests). Reconciled 27 Sep 2026 — this was flagged "highest priority, not started" and is actually the most complete addendum item in the repo.

## 8. Mandatory Addendum B — Nugen Intelligence Integration (HackCelestial 3.0)

**Compliance gate — a generic API call (including the current Anthropic assistant) explicitly does not satisfy this.**

- [ ] **Nugen account + a real, working API key obtained and tested with one live inference call.** This is the one item in this whole section I could NOT verify by reading code — the client code assumes a key will be supplied via `NUGEN_API_KEY`, but nothing in the repo proves an actual account/key exists or that a real call has ever succeeded against `api.nugen.in`. Do this before your demo; if judges ask "does this actually call Nugen," you need to have seen it happen, not just trust the code path.
- [~] Domain-specific dataset built — `backend/scripts/nugen_alignment_dataset.jsonl` exists with **21 examples** (disruption/cascade → plain-language explanation, recovery reasoning); short of the 30–100 originally scoped. Grow it before relying on it for alignment quality, though 21 is enough to prove the pipeline works end-to-end.
- [ ] Alignment workflow actually run via Nugen's API/cookbook to produce a deployed, callable domain-aligned model — dataset, `nugen_benchmark.json`, and `nugen_domain_document.md` are staged in `backend/scripts/`, but I found no evidence the alignment run itself has been executed against a real Nugen account. Same caveat as the API-key item above.
- [x] `app/core/nugen_client.py` inference client built (note: it's under `app/core/`, not `app/providers/` as originally planned) — same resilience pattern as `weather_provider.py`: never raises, times out gracefully, 429 gets a 60s cooldown, missing key or any failure returns `None` so callers fall back to the heuristic engine. Reconciled 27 Sep 2026.
- [~] Narrative generation routed through the aligned model — done for the Digital Twin what-if flow (`nugen_service.py` → `digital_twin_service.py`, tested); NOT done for the general Sathi assistant, which still runs on the Anthropic SDK (see §6 note above). Confirm with organizers whether the Digital Twin path alone satisfies the addendum, or whether every narrative needs to be Nugen-routed.
- [ ] Pipeline visibly documented for judges (README/architecture slide: Base model → Nugen alignment → aligned model → integrated into `digital_twin_service.py`) — the code and scripts exist but I found no README section or slide walking through this pipeline; write one, it's a quick win and this is a compliance gate.
- [ ] Exact Nugen API request/response payloads confirmed against `docs.nugen.in` — `nugen_client.py`'s docstring cites the OpenAI-style `/api/v3/inference/chat/completions` contract from Nugen's public spec, but this is still unverified against a real account/response (same root issue as the API-key item above).

## 9. Documentation & Presentation Hygiene

- [x] PRD, TRD, and Flow docs consolidated to a single current version (this pass)
- [ ] Commit a `docs/` folder into the actual repo (PRD/TRD/Flow currently exist only as external deliverables, not checked into the codebase per the original Master Doc note)
- [x] Re-run and screenshot the real test suite output into the README — done as part of this reconciliation pass. Actual verified counts as of 27 Sep 2026: **402 backend passed, 4 skipped (0 failed)** via `pytest app/tests/ -q`; **161 frontend passed, 0 failed** across 32 files via `npx vitest run`. (This item had already been updated once before to 138/105 and was still stale — re-verify by actually running the suites, not by trusting the last note, every time you touch this line.)
- [ ] QA walkthrough document (`Functionality & QA Test Document`) fully filled in and its Test Execution Summary totals completed (currently a template with the canonical Ladakh-scenario walkthrough pasted separately, not merged into the document itself)

---

### How to use this file
Check an item only after re-verifying it in the running code (grep/read the file, or re-run the relevant test) — not from memory of having planned it. When you close an item, update its note in place rather than deleting the line, so this stays a record of what changed and when.

### What's genuinely still open after this reconciliation
Everything else in this file is done and tested. The real remaining work is:
1. **Get and verify a real Nugen API key** — the only item nothing in the repo can confirm for you (§8).
2. **Grow the Nugen alignment dataset** past 21 examples if you want a stronger alignment run (§8).
3. **Run the Nugen alignment workflow** against a real account (§8).
4. **Decide and document** whether the Digital Twin's Nugen usage alone satisfies Addendum B, or whether the general Sathi assistant also needs to move off the Anthropic SDK (§6/§8).
5. **Write the Nugen pipeline doc/slide** for judges (§8).
6. **Fill in the QA walkthrough doc's Test Execution Summary** (§9).
7. **Full keyboard-navigation/focus-visible audit** beyond the two already-verified spots (§4).
8. Optional polish: commit a `docs/` folder into the repo (§9), add voice input if you want Flow E's original "or speaks" framing to be literally true (§6).
