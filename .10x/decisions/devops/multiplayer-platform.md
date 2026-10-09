# DevOps — multiplayer-platform

## 2026-10-09 — Deploy verification after the repo cleanup

Evidence: `.10x/reviews/2026-10-09-deploy-verification.md`. Read-only: no migration applied, no dashboard changed, no repo code changed.

### Done

- `main` is the default branch (`git ls-remote --symref origin HEAD` → `refs/heads/main`, `22ccf8a`).
- Migrations: Supabase `list_migrations` = the 7 files in `supabase/migrations` (versions and names). Content compared by md5 of `schema_migrations.statements`: 5 identical, 2 (`20261008173914`, `20261008181317`) identical except the file's final newline, which the MCP apply dropped. Decision: no repo change; the trailing newline is the repo convention and does not change the SQL.
- Cloudflare: the Worker `quantpoker` exists (`4e57a296…`). Its branch-control setting is not exposed by the Cloudflare MCP, so "deploys from `main`" is proved by artifact: `npm run build` at `22ccf8a` → 30/30 `dist/assets` JS/CSS files byte-identical to production.
- `/api/config`: 121 bytes, `supabaseUrl` + enabled publishable key only.
- JWKS: exactly one ES256 P-256 key, `kid 146bb67a-3a94-457d-b882-dc53d6154404` (as in the ADR).
- RLS query mechanism dry-run on production: `authenticated` with a claims `sub` sees 0 `hand_holes` (table empty); `anon` gets `42501 permission denied`. Live `pg_policies` match the migration.
- ADR vs code: the auth section and the 2026-10-08 amendment agree with `worker/src/auth.ts` and `wrangler.jsonc`. No doc fix needed.

### Open (blocked on the user)

- Day-5 token header: production has 0 auth users. Needs one real sign-in and the pasted header segment.
- `SUPABASE_SECRET_KEY`: not readable via MCP; proof is one two-account match archiving rows, then a role-scoped `hand_holes` query per player.
- 14 non-`main` branches still on `origin` (cleanup script not run). `claude/amazing-ride-4vip4x` is new and not in the branch-fates table.
- Legacy HS256 `anon` key still enabled in Supabase (rejected by the Worker's ES256 pin). Recommend disabling legacy keys later; out of scope.

### Gates (this session, `22ccf8a`)

lint, typecheck, typecheck:worker: exit 0 · `npm test` 610 passed (56 files) · `worker:test` 52 passed (5 files) · build exit 0, entry 141.4 kB gzip · e2e 18 passed.
