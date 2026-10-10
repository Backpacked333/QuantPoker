# landing-and-onboarding: QA

## Landing v2 (2026-10-10)

**Automated:**

- Unit (Vitest): 918 pass, including:
  - tween engine;
  - range data per hand (36 combos, none of them visible cards, root only);
  - the explanation sections and every account CTA (`#welcome/onboard`, `signup_start` counted);
  - the full hand on the 2D path.
- Playwright: 35 pass.
  - **New `landing-3d.spec.ts`:** software WebGL. The 3D canvas draws, the range caption shows, a whole hand plays with skips to the score card with no page errors, and a phone gets a 390 px stage with no horizontal scroll.
  - **The 2D landing specs, run in both themes:** axe-clean (light and dark), keyboard play, skip remembered.
- Worker: 209–210 of 212 pass locally. Three `lobby.test.ts` rated-pairing tests fail **identically on a clean `main` checkout** in this environment; this branch changes no Worker code.

**Manual (screenshots, slowed stage clock):**

- Seated view, range cloud with caption, stamp, verdict bars, score card with the table slid left, the How it works and Your account sections; desktop and a 390 px phone.

**Bugs found and fixed:**

- On phones the stage box had zero width (the hero's `align-items: center`).
- The header CTA pushed the tool icons off a phone screen.
- The verdict camera was far too close.
- The range cloud overlapped the headline.
- The pot label covered Atlas's cards.
- An ambiguous text query in a test.
- Tracking dedupe leaked between tests.
