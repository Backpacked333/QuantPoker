# landing-and-onboarding: what was built (SDE)

## Landing v2 (2026-10-10): cinematic 3D, explained, account-first

Spec: `.10x/specs/2026-10-10-landing-3d-design.md`. ADR-001.

**Built:**

- `src/landing/stage/`:
  - `stage.ts`: the scene, beats, camera rigs, adaptive quality and context-loss fallback;
  - `textures.ts`: card faces, the back, the felt, combos and the dust dot, all drawn at runtime;
  - `tween.ts`: a pure, tested tween engine;
  - `StageCanvas.tsx`: lazy load, a poster, failure → 2D;
  - `support.ts`: the WebGL and reduced-motion check.
- `ChallengeHand` drives the stage or the 2D `Table`. The beats escalate: range cloud (first decision), stamp (middle), verdict (last). Labels portal into a layer over the canvas, with a screen-reader summary.
- `build.ts` precomputes Atlas's top 36 combos at each hand's first decision (`node.range`). The grades are unchanged.
- `Landing.tsx`: the 3D hero; How it works (four illustrated steps); Your free account (seven perks with a CTA); fair play; the final CTA.
- The header shows Sign in / Create free account on the landing page ("Join free" on phones). The score card leads with saving the score to an account.
- `motion.ts`: `useCountUp`, `useReveal`, `tilt`.

**Deviations from the spec:**

- **No frame-time e2e on the 3D path:** CI's software GPU runs at about 3 fps. The adaptive tier and the trainer's frame-time test remain.
- **The verdict plays on the last decision of the hand,** not on "the biggest pot". The last decision is almost always the biggest, and the rule is deterministic.
- **`?stageslow=<n>` slows the stage clock** for screenshots and debugging.

**Tech debt:**

- The stage and the 2D table are two presentations of one hand, kept in step only through `ChallengeHand`.
- Sounds are gated on the trainer's sound setting, which is off by default, so most visitors hear nothing.

## Phases 1–2 (earlier)

See `.10x/decisions/architect/landing-and-onboarding.md` §As built.
