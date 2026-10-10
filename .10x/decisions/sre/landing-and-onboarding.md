# landing-and-onboarding: operations

- **SLO impact:** none server-side; landing v2 is presentation.
- **Signals:** `/api/funnel` (`landing_view` → `challenge_start` → `challenge_complete` → `signup_start` → `signup_complete`).
  - A drop in start or complete after this deploy points at the 3D path (slow devices or load time).
  - The fix is to make `want3d()` stricter, or revert.
- **Client failure modes:**
  - WebGL is missing or lost: the 2D table.
  - The stage chunk fails: the 2D table.
  - A slow device: the adaptive tier (pixel ratio, shadows, dust).
