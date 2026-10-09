# Deploy verification after the repo cleanup (2026-10-09)

Role: DevOps / SRE. Scope: prove production matches `main`, close the ADR day-5 auth check. Read-only against Supabase and Cloudflare; nothing applied, no dashboard changed.

Repo state checked: `main` = `22ccf8a` (PR #5 squash on top of PR #8 squash `ec3fa65`); branch `claude/zen-darwin-0t5q1p` started at the same commit.

## Summary

| #   | Check                                                     | Result                                                                                                                                                                                  |
| --- | --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1a  | `main` is the default branch                              | **Pass**                                                                                                                                                                                |
| 1b  | 7 repo migrations = 7 production migrations               | **Pass** (same versions and names; 5 byte-identical, 2 differ only by the file's final newline)                                                                                         |
| 1c  | Cloudflare deploys from `main`                            | **Pass by artifact** (all 30 built JS/CSS files byte-identical to production). The branch-control setting itself is not readable through the Cloudflare MCP: not verified as a setting. |
| 2   | `GET /api/config` returns URL + publishable key only      | **Pass**                                                                                                                                                                                |
| 3   | JWKS has exactly one ES256 key                            | **Pass**, `kid 146bb67a-3a94-457d-b882-dc53d6154404` (same key as the ADR recorded on 2026-10-08)                                                                                       |
| 4   | Real access token header: `alg ES256`, `kid` matches      | **Pending: needs the user's sign-in.** Production has 0 auth users.                                                                                                                     |
| 5   | `SUPABASE_SECRET_KEY` set; archive + per-player RLS proof | **Pending: needs a two-account match.** All archive tables are empty (0 rows). Query mechanism dry-run on production works (below).                                                     |

## 1a. Default branch

```
$ git ls-remote --symref origin HEAD
ref: refs/heads/main	HEAD
22ccf8a60192bfd75e3cc3875bc15a798a191430	HEAD
```

Finding (not blocking): cleanup step 7 has not run yet. `origin` still has 14 branches besides `main` (`claude/amazing-ride-4vip4x`, `claude/blissful-planck-wrb5my`, 6 `devin/1791*`, 6 `devin/quantpoker-r1-*`). The cleanup script from the previous handoff tags and deletes them; it runs from the user's machine.

## 1b. Migrations

Supabase MCP `list_migrations` (project `dbkfuxczfkawxqmaieii`):

```
20261007192620 learning_cloud
20261008133809 players
20261008134201 matches_hands
20261008134322 record_hand
20261008134345 abandonments_match_index
20261008173914 record_match
20261008181317 record_match_no_show
```

`ls supabase/migrations` gives the same 7 versions and names. Content check: `md5(array_to_string(statements, E'\n'))` from `supabase_migrations.schema_migrations` against `md5sum` of each file:

| Version        | Production                         | File (full)                        | File without final `\n`            | Verdict                 |
| -------------- | ---------------------------------- | ---------------------------------- | ---------------------------------- | ----------------------- |
| 20261007192620 | `170f50fbda835ec89c4148d8fce80b9b` | `170f50fbda835ec89c4148d8fce80b9b` |                                    | identical               |
| 20261008133809 | `f9f1fbacfb8a696093808147a5e03ee1` | `f9f1fbacfb8a696093808147a5e03ee1` |                                    | identical               |
| 20261008134201 | `44cd7212a656a852497aa8eaa3c1d686` | `44cd7212a656a852497aa8eaa3c1d686` |                                    | identical               |
| 20261008134322 | `e4abfdfe6b248c9a350a78b320dfc86a` | `e4abfdfe6b248c9a350a78b320dfc86a` |                                    | identical               |
| 20261008134345 | `1385462a049a60b06065d2839efac4ab` | `1385462a049a60b06065d2839efac4ab` |                                    | identical               |
| 20261008173914 | `06041cbb533ed780398437844f494235` | `6702cc61a183fbbba1ce635bb9532994` | `06041cbb533ed780398437844f494235` | same SQL, final newline |
| 20261008181317 | `2b59ba3e3713de90909507785a55ecf2` | `c2ef653b7fc448e8df779bd4be58d67d` | `2b59ba3e3713de90909507785a55ecf2` | same SQL, final newline |

The two `record_match` migrations were applied through the MCP without the trailing newline the file has; the SQL is byte-identical otherwise. No repo change: the file is the convention (every file ends in `\n`), and a trailing newline does not change what Postgres runs.

Live RLS policies (`pg_policies`) match `20261008134201_matches_hands.sql`: `public_read` (anon, authenticated, `true`) on `matches`, `match_players`, `hands`, `abandonments`; `hand_holes_own` (authenticated, `(select auth.uid()) = user_id`); `players_read`, `players_update_own`.

## 1c. Cloudflare serves `main`

Cloudflare MCP `workers_get_worker quantpoker` → id `4e57a2962c054cb880caa6d7a71a4edf` (exists; the MCP exposes no build or branch-control settings, so "Production branch = main" is not read as a setting).

Artifact proof instead: `npm run build` at `22ccf8a`, then every file in `dist/assets/*.{js,css}` compared with `curl https://quantpoker.bbcroysalman.workers.dev/assets/<file> | md5sum`:

```
30 same, 0 different
live index.html → /assets/index-SE4hRMVq.js, /assets/index-BKEglpLO.css (= local dist/index.html)
```

Vite file names are content hashes, so production serves exactly the `main` client. The Worker script itself was not byte-compared (wrangler bundles at deploy time); its behaviour is checked through `/api/config` below.

## 2. `/api/config`

```
$ curl -sS https://quantpoker.bbcroysalman.workers.dev/api/config
HTTP/2 200, content-type: application/json, content-length: 121
{"supabaseUrl":"https://dbkfuxczfkawxqmaieii.supabase.co","supabaseKey":"sb_publishable_DKfxJ0I2bbnrMHMyxiK4eg_tqsrKoI7"}
```

Two fields, both public by design and equal to `wrangler.jsonc` `vars`. The key is the project's enabled publishable key (`get_publishable_keys`: id `693bc388-…`, `disabled: false`). No secret key, no service-role JWT, no `DEV_AUTH_SECRET`.

Note (not blocking): the project's legacy `anon` key (an HS256 JWT) is still enabled. The Worker never accepts it (`algorithms: ['ES256']`, covered by `worker/test/auth.test.ts`) and the client does not use it. Disabling legacy API keys is a dashboard change, out of scope here; recommended once nothing else uses them.

## 3. JWKS

```
$ curl -sS https://dbkfuxczfkawxqmaieii.supabase.co/auth/v1/.well-known/jwks.json
{"keys":[{"alg":"ES256","crv":"P-256","ext":true,"key_ops":["verify"],
  "kid":"146bb67a-3a94-457d-b882-dc53d6154404","kty":"EC","use":"sig", "x":"JIf2…", "y":"EsQk…"}]}
```

Exactly one key, ES256 / P-256, `kid 146bb67a-3a94-457d-b882-dc53d6154404`, unchanged since the ADR (§Auth, assumption 4).

## 4. Access-token header (ADR day-5) — pending

`select count(*) from auth.users` → **0**: nobody has signed in to production yet, so there is no real token to decode. To close it:

1. Sign in at https://quantpoker.bbcroysalman.workers.dev/#lobby.
2. In DevTools console: `JSON.parse(localStorage[Object.keys(localStorage).find(k => k.endsWith('-auth-token'))]).access_token.split('.')[0]`
3. Paste only that first segment (it is the header; it carries no claims and no signature).

Pass: `{"alg":"ES256","kid":"146bb67a-3a94-457d-b882-dc53d6154404","typ":"JWT"}`. If `alg` is `HS256`: Supabase → Project Settings → JWT Keys → rotate so the ES256 key is the current signing key; the Worker gets no HS256 fallback.

## 5. Archive and per-player RLS — pending

All counts 0 (`auth.users`, `players`, `matches`, `match_players`, `hands`, `hand_holes`, `abandonments`). Whether `SUPABASE_SECRET_KEY` is set cannot be read from Cloudflare through the MCP; the proof is one real match archiving rows.

Mechanism verified on production today, read-only and rolled back:

```sql
begin read only;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"<uuid>","role":"authenticated"}', true);
select current_user, auth.uid(), (select count(*) from public.hand_holes), (select count(*) from public.hands);
rollback;
-- → authenticated | <uuid> | 0 | 0
```

```sql
begin read only; set local role anon; select count(*) from public.hand_holes; rollback;
-- → ERROR 42501: permission denied for table hand_holes
```

After one two-account match: count `matches`/`match_players`/`hands`/`hand_holes` for that match id (expect 1 / 2 / N / ≤ 2N: a hole row per seat dealt in), then the query above once with each player's `sub`. Pass: each player sees only rows with their own `user_id`, and the two sets are disjoint.

## Gates (run at `22ccf8a`, this session)

| Gate                       | Result                                     |
| -------------------------- | ------------------------------------------ |
| `npm run lint`             | exit 0                                     |
| `npm run typecheck`        | exit 0                                     |
| `npm run typecheck:worker` | exit 0                                     |
| `npm test`                 | 56 files, **610 passed**                   |
| `npm run worker:test`      | 5 files, **52 passed**                     |
| `npm run build`            | exit 0; entry `141.4 kB` gzip (budget 150) |
| `npm run e2e`              | **18 passed**                              |
