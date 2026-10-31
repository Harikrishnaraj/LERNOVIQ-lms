# Redis Cache Server — Plan (DRAFT, awaiting approval)

Status: **Draft for review.** Nothing here is implemented, deployed or changed on the VPS. Every
step below starts only after the user approves it. Decisions marked *(user)* come from the
2026-10-23 direction; items marked *(open)* still need an answer.

## 1. Current state (inspected 2026-10-23)

| Area | What exists today | Evidence |
|---|---|---|
| Server cache | None. No `unstable_cache`, `"use cache"`, `cacheTag` or `revalidateTag` anywhere in `src/`. | `grep` over `src/` |
| Page revalidation | ~200 `revalidatePath(...)` calls after mutations (Next's own route cache only). | `grep -rn revalidatePath src` |
| Rate limiting | Postgres sliding window: `check_rate_limit(key, limit, window)` deletes old hits, counts, inserts — one RPC per bucket, two buckets (IP ×30, subject) per check. 14 actions, called from 27 files. Concurrent requests can overshoot. Fail closed for `login`, `password-reset`, `verify-email` (GAP-124), fail open otherwise. | `src/services/rate-limit/index.ts`, `supabase/migrations/20260923140000_rate_limits.sql` |
| Public catalog | `search_courses` RPC (security definer, `visibility = 'public'`, no `auth.uid()`), `listCategories` (plain select), `getCourseDetail` → `get_course_detail` + prerequisites + sections + `get_lesson_outline`. Pages: `/courses`, `/courses/[slug]`, marketing home "top rated". | `src/features/catalog/*`, `src/app/courses/*`, `src/app/(marketing)/page.tsx` |
| SCORM files | Each request downloads the object from Supabase Storage, plus 2 DB reads for the learner shim on HTML. Out of scope for this plan's first phases *(user)*. | `src/app/api/scorm/[lessonId]/[...path]/route.ts` |
| Hosting | One Hostinger KVM VPS, Docker Compose: `app`, `caddy`, `cron`. No Redis. Deploy = GitHub Actions `ci.yml` job "Deploy to VPS" over SSH. | `deploy/docker-compose.yml`, `.github/workflows/ci.yml` |
| CI | `ci.yml`: Check job (typecheck, lint, unit, features, build) + 6 Playwright shards against `supabase start`. No Redis service. | `.github/workflows/ci.yml` |
| Supabase plan | Free (50 MB per stored object). Not directly relevant to Redis, but it is why Storage traffic matters. | org `plan: free` |

**VPS resources: not yet measured.** This session has no SSH access to the VPS, so RAM, free
memory, swap, container usage and peaks are unknown. Per *(user)* decision 2, no memory cap is
chosen until they are measured — see §3.

## 2. Decisions

1. **Hosting** *(user)*: `redis:7-alpine` container on the existing VPS, reachable only on the
   Compose private network (no `ports:`), `requirepass` from a deploy secret. If §3 shows
   insufficient headroom, stop and present Upstash (managed, TLS, free tier ~256 MB / 500k
   commands/month) before going further.
2. **Disposable cache** *(user)*: no persistence (`--save "" --appendonly no`), `maxmemory` from
   §3, `maxmemory-policy allkeys-lru`.
3. **Order** *(user)*: Phase A rate limiting → Phase B public catalog, categories, course metadata.
   Separate PRs, each reviewed. Private course-file caching is Phase D, only with explicit
   authorization and cache-isolation tests. Large files (videos, SCORM packages) never go into
   Redis *(user)*.
4. **Security** *(user)*: no shared keys for user-dependent responses; password-protected; no
   public port; GAP-124 fail-closed behaviour preserved when Redis is unavailable.
5. **Invalidation** *(user)*: version-aware keys + TTL + explicit invalidation on course update /
   publish, wired next to the existing `revalidatePath` calls.
6. **Client library** *(open, recommendation)*: `ioredis` (mature, works in the Node runtime the
   app uses; `node-redis` is the alternative). Pin an exact version per RULES.

## 3. Phase 0 — measure the VPS (read-only, needs approval)

Goal: pick `maxmemory` from data, not a guess. Two ways to collect the numbers, both read-only:

- **Option 1 (no repo change):** the user runs these in Hostinger hPanel → VPS → Browser terminal
  and pastes the output:
  ```sh
  nproc; free -m; swapon --show; df -h /
  docker stats --no-stream --format 'table {{.Name}}\t{{.MemUsage}}\t{{.MemPerc}}\t{{.CPUPerc}}'
  docker inspect -f '{{.Name}} {{.HostConfig.Memory}}' $(docker ps -q)
  uptime; cat /proc/pressure/memory 2>/dev/null
  ```
  For peaks, repeat `docker stats --no-stream` during a busy period (e.g. while learners run a
  course), or run `vmstat 60 60` for an hour.
- **Option 2 (repo change, needs approval):** a manual `workflow_dispatch` workflow
  `vps-diagnostics.yml` that SSHes with the existing deploy key and prints only the commands
  above. No writes on the server.

**Sizing rule (proposed):** `maxmemory = min(256 MB, 10% of total RAM)`, and only if after adding
it the box keeps ≥ 25% RAM free at the measured peak. Otherwise → Upstash proposal. Container
`mem_limit` = `maxmemory` + 64 MB overhead.

## 4. Phase A — Redis-backed rate limiting

Design:
- `src/lib/redis.ts`: lazy singleton `ioredis` client from `REDIS_URL`; `connectTimeout` ~500 ms,
  `commandTimeout` ~200 ms, `maxRetriesPerRequest: 1`, `enableOfflineQueue: false`, so a dead
  Redis fails fast instead of queueing requests. No `REDIS_URL` → Redis is "not configured".
- `src/services/rate-limit/index.ts` keeps its public API (`rateLimit`, `clientIp`, `LIMITS`,
  `RATE_LIMITED_MESSAGE`) so the 27 callers do not change. Inside: if Redis is configured, a
  sliding window on a sorted set per bucket, done atomically in one Lua script
  (`ZREMRANGEBYSCORE` → `ZCARD` → conditional `ZADD` + `PEXPIRE`), which also removes today's
  overshoot. Keys: `rl:{action}:{bucket}` (bucket already lower-cased; IP and subject buckets as
  today).
- **Failure behaviour (GAP-124):** Redis error/timeout → `login`, `password-reset`,
  `verify-email` return **false** (blocked); all other actions fall back to the existing Postgres
  limiter, and if that also fails, fail open as today. Missing `REDIS_URL` → Postgres path exactly
  as today (so local dev and CI keep working).
- Postgres `check_rate_limit` and `rate_limit_hits` stay; a later cleanup task removes them once
  Redis has run in production for a while.

Infrastructure (separate, explicitly authorized step): `redis` service in
`deploy/docker-compose.yml` (no `ports`, `command` with `--requirepass ${REDIS_PASSWORD}
--maxmemory … --maxmemory-policy allkeys-lru --save "" --appendonly no`, healthcheck
`redis-cli ping`, `mem_limit`); `app` gets `REDIS_URL=redis://:${REDIS_PASSWORD}@redis:6379/0`;
deploy job writes `REDIS_PASSWORD` from a new GitHub secret `PROD_REDIS_PASSWORD`.

## 5. Phase B — public catalog, categories, course metadata

Only data that is identical for every visitor:

| Data | Source | Key | TTL | Invalidated by |
|---|---|---|---|---|
| Categories | `listCategories` | `cat:v1:list` | 1 h | category create/update/delete actions |
| Catalog search page | `search_courses` (public only, no `auth.uid()`) | `catalog:v1:{gen}:{sha1(normalized filters)}` | 5 min | course publish/unpublish/archive, price change → bump `catalog:gen` |
| Course landing (public part) | `get_course_detail`, prerequisites, sections, `get_lesson_outline` for the **published version** | `course:v1:{slug}:{publishedVersionId}` + `course:slug:{slug}` → id | 15 min | publish/new version/unpublish/archive → delete `course:slug:{slug}`; versioned key ages out |

Rules:
- Before caching `getCourseDetail`, confirm `get_course_detail` and `get_lesson_outline` return
  nothing viewer-specific (enrollment, org-private visibility, preview flags tied to the user). If
  any part depends on the viewer, cache only the viewer-independent part and keep the rest live.
- Cached values are plain JSON; a cache miss or Redis error just calls the original function
  (fail open — this is non-sensitive public data).
- A small `cached(key, ttl, fn)` helper plus `invalidate(...keys)` / `bumpGeneration(name)` in
  `src/lib/cache.ts`. Calls sit next to the existing `revalidatePath` calls in the course
  publish/archive/version actions and category actions, so both caches clear together; a unit test
  asserts each such action calls both.
- Personal progress, admin data, payment state and anything permission-sensitive are never cached
  (ARCHITECTURE §13).

## 6. Phase C — monitoring

- App: structured logs (`src/lib/log`) for `cache.hit`/`cache.miss`/`cache.error` and
  `rate_limit.redis_error` with counts per minute (sampled), plus latency of Redis calls.
- Admin "System health" (existing admin area, if present) or a protected `/api/health/redis`:
  `INFO memory|stats` → used memory, `maxmemory`, `evicted_keys`, `keyspace_hits/misses` (hit rate),
  `connected_clients`, last error. Service role / admin only.
- Runbook entry in `docs/RUNBOOKS.md`: Redis down (expected behaviour, how to restart), memory
  full / high evictions (raise cap or shorten TTLs), flushing the cache safely (`FLUSHDB` is safe —
  it is a disposable cache).

## 7. Phase D — private course-file caching (NOT approved; later)

Requires explicit authorization. Would cache only small (< 1 MB) non-HTML package assets keyed by
`storage_prefix/path` (the prefix is per lesson version and random), served only after the
existing token/enrollment check, never the shim-injected HTML; needs cache-isolation tests
(learner A cannot get learner B's CMI/shim; revoked token gets 404 even on a warm cache).

## 8. Proposed ADR (to add to `docs/DECISIONS.md` on approval)

> **ADR-047 — Redis cache on the VPS.** Production gets a disposable Redis 7 container on the
> Compose private network (no public port, password, `allkeys-lru`, no persistence, `maxmemory`
> sized from measured VPS headroom). First uses: rate limiting (atomic sliding window; GAP-124
> fail-closed auth actions preserved, others fall back to Postgres) and caching of public,
> viewer-independent catalog data with version-aware keys, TTLs and explicit invalidation next to
> `revalidatePath`. Large files and SCORM packages are never stored in Redis; private course-file
> caching needs a separate decision. If the VPS lacks headroom, Upstash replaces the container with
> the same client code. *Status: Proposed.*

## 9. Proposed FEATURES / TASKS entries (to add on approval)

FEATURES.md — Platform & quality:

| ID | Feature | Done when |
|---|---|---|
| F-964 | Redis-backed rate limiting | All 14 actions limited through Redis atomically; with Redis down, login/password-reset/verify-email are refused and the rest fall back to Postgres; tests prove both. |
| F-965 | Cached public catalog | Categories, catalog search and public course pages served from Redis on a warm cache; publish/edit/archive shows fresh data immediately; no viewer-specific data in any cached value (test). |
| F-966 | Redis operations | Redis runs private and password-protected with a measured memory cap; hit rate, memory, evictions, latency and errors are visible to admins; runbook covers outage and memory pressure. |

TASKS.md — new phase "Phase 15 — Redis cache (ADR-047)":

| Task | Scope | Agent / model / effort |
|---|---|---|
| T-274 | Phase 0: collect VPS resource numbers (Option 1 or 2), record in MEMORY.md, propose `maxmemory` or Upstash | main session, Opus, low (user runs commands or approves the diagnostics workflow) |
| T-275 | ADR-047 + FEATURES/TASKS/ARCHITECTURE §13/§21 + SECURITY entries (docs only) | main session, Opus, medium |
| T-276 | `src/lib/redis.ts` client + Redis service in CI (`services: redis` in Check and E2E jobs) + unit tests with a real Redis | `general-purpose` subagent, Sonnet, medium |
| T-277 | Rate limiter on Redis (Lua sliding window, GAP-124 fallbacks), unit + integration tests incl. "Redis down" and concurrency (no overshoot) | main session, Opus, high (security-sensitive) |
| T-278 | Compose `redis` service, `PROD_REDIS_PASSWORD` secret, deploy-job env, DEPLOY.md — **infra change, separate approval before merge/deploy** | main session, Opus, high |
| T-279 | `src/lib/cache.ts` + catalog/categories/course-detail caching + invalidation next to `revalidatePath`, tests (warm hit, invalidation on publish, no viewer data) | `general-purpose` subagent, Sonnet, high; review by `engineering:code-review` at high |
| T-280 | Monitoring: logs/metrics, admin health endpoint, RUNBOOKS.md | `general-purpose` subagent, Sonnet, medium |
| T-281 | Remove Postgres limiter after ≥ 2 weeks stable (migration drops `rate_limit_hits`/`check_rate_limit`) | main session, Sonnet, low — later |
| (Phase D) | Private course-file caching — not scheduled until authorized | — |

Every code task follows the repo loop (`npm run check`, relevant E2E, MEMORY.md, `feat: … (T-0NN)`),
one PR per task or pair, and `hawkscan` once a scan key is configured.

## 10. Test plan (additions to `docs/TEST_PLAN.md`)

- **Unit:** Lua window (allow up to N, block N+1, window slides), key normalization, timeouts.
  `rateLimit` with Redis erroring: auth actions → false; others → Postgres fallback → true/false as
  Postgres says; Postgres also failing → fail open. `cached()` hit/miss/error paths; invalidation
  helpers.
- **Integration (real Redis in CI):** 50 concurrent `rateLimit` calls against limit 10 → exactly
  10 allowed. Catalog cached value contains no `auth.uid`-derived fields; publishing a course
  changes the catalog result on the next request.
- **E2E:** existing login lockout / contact form / catalog specs still pass with Redis on; one spec
  publishes a course as instructor and sees it in the public catalog immediately.
- **Security checks:** no `ports:` on `redis` in compose (test greps compose), `REDIS_URL` never
  `NEXT_PUBLIC_*`, password required (`AUTH` failure test).
- **Ops check after deploy (manual, approved):** `docker compose exec redis redis-cli -a … INFO`
  shows `maxmemory` and policy; app logs show hits; stopping Redis briefly → login refused, catalog
  still loads.

## 11. Deployment-doc changes (`docs/DEPLOY.md`, on approval)

New secret `PROD_REDIS_PASSWORD`; the `redis` service and why it has no port; memory cap and how it
was chosen; how to check health; the behaviour when Redis is down; rollback = remove `REDIS_URL`
from the env (app falls back to Postgres / uncached) and redeploy.

## 12. Open questions

1. Phase 0: Option 1 (you run commands in hPanel) or Option 2 (I add a read-only diagnostics workflow)?
2. Client library: `ioredis` OK?
3. Does an admin "System health" page exist that the Redis metrics should join, or a new protected endpoint?
4. Is any public course page content expected to differ for logged-in users (e.g. "Enrolled" badge)? That part stays uncached.
