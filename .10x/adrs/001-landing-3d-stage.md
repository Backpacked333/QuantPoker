# ADR-001: An imperative three.js stage for the landing page

**Status:** Accepted
**Date:** 2026-10-10
**Feature:** landing-and-onboarding (landing v2)
**Author:** 10x-Team (Architect + Staff Engineer)

## Context

The landing page must become cinematic: a lit 3D table, cards dealt and flipped, camera moves, a range cloud and a slow-motion verdict at decisions. It must run on phones from a group-chat link, keep the 150 kB entry budget, stay keyboard and screen-reader usable, and reuse the shipped challenge logic, scoring and accounts unchanged.

## Decision

- **A small imperative three.js "stage" module** (`src/landing/stage/`), loaded with a dynamic import from the landing chunk, owns the canvas, the render loop, its tweens and its quality tier.
- **React (`ChallengeHand`) stays the single source of truth for the hand,** and tells the stage what to show through a narrow API.
- **Card faces are drawn to canvas textures at runtime,** so there are no image assets.
- **Quality adapts:** start at the device pixel ratio capped at 2, measure frame time for 90 frames, then step down (pixel ratio 1, no shadows, fewer particles) until frames stay under 22 ms.
- **The 2D `Table` remains the fallback** for no WebGL, reduced motion, `?motion=off`, and tests.

## Alternatives Considered

| Alternative                    | Pros                        | Cons                                                                             | Why Not                                           |
| ------------------------------ | --------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------- |
| react-three-fiber + drei       | Declarative, rich helpers   | Two new dependencies (≈60 kB+ gz), a second render model to learn, version churn | Not worth it for one scene; three is already here |
| CSS 3D transforms only         | No WebGL, light             | No real lighting, shadows or particles; cannot reach "cinematic"                 | Fails the brief                                   |
| Pre-rendered video             | Beautiful, cheap at runtime | Not interactive; the hand is chosen per visitor; heavy downloads                 | The hand must react to choices                    |
| Spline or another hosted scene | Fast to author              | Third-party runtime and assets, vendor lock-in, privacy                          | Against the first-party rule                      |

## Consequences

### Positive

- No new dependencies; three is shared with the lab's 3D view chunk.
- The stage is testable in isolation (pure tween and layout helpers), and the game logic stays testable in jsdom through the 2D path.

### Negative

- Imperative scene code to maintain, and manual disposal of geometries and textures.
- Two presentations of one hand (3D and 2D) must stay in step. A shared `ChallengeHand` state limits the drift.

### Risks

- **Low-end phones drop frames.** Mitigation: the adaptive tier, plus the e2e frame-time check.
- **WebGL context loss.** Mitigation: on `webglcontextlost`, the page swaps to the 2D table.
- **Card faces drawn in 3D can't be read by screen readers.** Mitigation: a live text summary next to the canvas.

## Dependencies

- three (already in package.json), and the precomputed range per node in the challenge trees.
- Constrains: a future 3D trainer table should reuse this stage rather than add a second scene system.
