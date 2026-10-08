# SDE — index

Last updated: 2026-10-08

## Active features

| Slug                   | Description                              | Status                                                             |
| ---------------------- | ---------------------------------------- | ------------------------------------------------------------------ |
| `multiplayer-platform` | Phase 0 per the architect's ADR, 7 steps | Step 1 (engine, protocol, presets) **done**; Steps 2–7 not started |

## Cross-cutting notes

- **Node-environment suites.** Pure-logic tests (engine, protocol) start with `// @vitest-environment node`; jsdom costs seconds per file and the setup file is DOM-guarded for them.
- **Long property walks** take an explicit timeout (`180_000`, or one hour under `ENGINE_SOAK=1`) and avoid `expect()` in the hot loop: plain throws for per-action checks, `expect` for per-hand checks.
- **Engine states are values.** Never mutate a `HandState` you did not just create inside a transition; `act` shares config, deck, actions and card tuples between states.
- **Profile before trimming tests.** The first fix for a slow suite was in the engine (structural clone), not in fewer assertions.
