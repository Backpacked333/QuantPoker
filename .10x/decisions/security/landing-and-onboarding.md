# landing-and-onboarding: security notes

## Landing v2 (2026-10-10)

- **No new endpoints, storage or secrets.** The 3D stage is client-only presentation. three.js is the version already in `package.json`.
- **Canvas textures are drawn from our own constants** (card codes from the shipped trees); no user input reaches a canvas or the DOM unescaped.
- **`?stageslow`** only slows the client's own clock and is clamped to 1–50.
- **The account CTAs go to the existing `#welcome/onboard` flow** (Supabase auth, unchanged).
- **Events are unchanged:** names from the allowlist, a random visitor id, nothing else.

Verdict: no new risk. The earlier phases' review stands (the architect file, failure modes).
