# landing-and-onboarding: delivery

- **Deploy:** merge to `main`. The Git-connected Cloudflare build runs `npm run build` and `wrangler deploy`. No new bindings, secrets or migrations in landing v2.
- **Bundle:** the entry chunk is 143.3 kB gzip (budget 150). The landing chunk is about 35 kB. The stage is about 6.5 kB plus three.js (133 kB, a shared lazy chunk), loaded only on the landing page with WebGL.
- **Rollback:** revert the merge commit. The 2D path is the fallback inside the build anyway.
- **Verify after deploy:** `/`, `/og-challenge.png` and `/api/health` respond; a fresh browser sees `.landing.is-3d` with WebGL.
