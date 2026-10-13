# LERNOVIQ — RAG Implementation Plan

**Status:** Decisions in §1 settled (ADR-039, revised by ADR-040, 2026-10-12). Steps 1 (T-200) and 2 (T-220) built; search is Postgres full-text, embeddings optional (ADR-042).
**Covers:** T-220–T-225 (F-800, F-801, F-802) and the parts of T-200 (F-700) and T-201 (F-701) that
RAG cannot work without.
**Based on:** `main` at `f3c8333` (2026-10-05). Organizations, SSO, security headers, logging,
privacy, backups and CI are done; AI (T-200–T-205) and RAG (T-220–T-225) are untouched.
**Governing docs:** ARCHITECTURE §18, ADR-015 (provider adapters), ADR-016 (AI is assistive),
ADR-017 (permission-aware retrieval), SECURITY §16, PRD §12, TEST_PLAN §15 and §17.

---

## 1. Decisions (ADR-039, revised by ADR-040)

| # | Decision | Chosen |
| --- | --- | --- |
| 1 | **Answer model** | **Groq** (`groq-sdk`), default `openai/gpt-oss-120b`, behind the chat adapter. Model ID is config (`AI_TUTOR_MODEL`). |
| 2 | **Search method** | **Postgres full-text first** (ADR-042). Embeddings are optional and nullable; OpenAI was dropped because no key could be obtained (ADR-041 superseded for v1). |
| 3 | **What the first version searches** | **(a) published lesson text only.** Then admin/org documents (F-802), then lesson attachments. |
| 4 | **Keys** | `GROQ_AI_API_KEY` (secret `PROD_GROQ_AI_API_KEY`) only. `OPENAI_API_KEY` is optional and unused until embeddings are added. Tests and CI use the fake providers. |

Per CLAUDE.md "Blocked?", no provider is stubbed and ticked: missing keys are recorded in
`MEMORY.md` under Known Issues.

---

## 2. Architecture

As ARCHITECTURE §18 describes it:

```text
                 ┌──────────── indexing (background) ────────────┐
course published │ extract text → chunk → embed → knowledge_chunks│
doc uploaded  ──▶│        (job table, run by the cron worker)     │
                 └───────────────────────────────────────────────┘
learner question
   → rate limit → policy check (assessment mode?)
   → embed question
   → match_knowledge_chunks()   ← permission filter INSIDE the SQL, before ranking
   → top chunks as cited documents → model → answer + source links
   → ai_messages (tokens, cost)
```

New code follows the existing `src/services/*` pattern:

| Path | Purpose |
| --- | --- |
| `src/services/ai/` | Chat adapter (ADR-015) |
| `src/services/embeddings/` | Embedding adapter (ADR-015) |
| `src/features/knowledge/` | Ingestion, chunking, retrieval |
| `src/features/ai-tutor/` | Tutor server actions and UI |

---

## 3. Data model (T-220)

- **`knowledge_sources`**: one row per thing that gets indexed.
  - `kind`: `lesson` | `lesson_asset` | `document`.
  - **Scope:** exactly one of `course_version_id`, `organization_id`, or platform-wide.
  - `status`: `pending` → `processing` → `ready` | `failed`, plus `error` and `content_hash`.
- **`knowledge_chunks`**: `source_id`, scope columns copied from the source (so filtering needs no
  joins), `lesson_id` (for "open this lesson" links), `position`, `content`, `token_count`,
  `embedding vector(1536)` (1536, ADR-041), `embedding_model`, and a `tsvector` column for keyword search.
  - HNSW index on `embedding`; GIN index on the `tsvector`.
- **`knowledge_jobs`**: the work queue, with `attempts` and `last_error`.
- **RLS:** no direct client access to either table. Reads go only through the retrieval
  function; writes go only through the service role.

**Versioning:** only **published course versions** are indexed, keyed by `course_version_id`.

- A learner enrolled in v1 gets v1's content.
- A draft never leaks into the tutor.
- Publishing a new version (ADR-011) queues that version for indexing.

---

## 4. Ingestion pipeline (T-221)

1. **Triggers**
   - Course publish (`apply_course_transition` → published) queues every lesson of that version.
   - Admin/org document upload queues the document.
   - Deleting or archiving a source removes its chunks in the same transaction.
2. **Worker:** a new `/api/cron/knowledge-ingest` route, protected by `CRON_SECRET` like
   `/api/cron/scheduled-reports`.
   - The cron container currently fires hourly; this route should run about every minute.
   - Jobs are claimed with `FOR UPDATE SKIP LOCKED`, so overlapping runs never process the same job.
3. **Extract**
   - Lessons are already sanitized HTML (`lessons.content`): strip to text, keeping headings.
   - Documents (a later step) go through a PDF/DOCX text extractor, reusing the existing upload
     validation and the `upload-initiate` rate limit.
4. **Chunk:** split by headings and paragraphs, about **400 tokens per chunk with ~15% overlap**.
   Prefix each chunk with "Course › Section › Lesson" so it makes sense on its own.
5. **Embed:** batch the calls, and skip chunks whose `content_hash` hasn't changed, so re-indexing
   a course only pays for edited lessons.
6. **Failures:** cap the retries, then mark the source `failed` with the error (F-800 requires
   failed status to be visible).

---

## 5. Permission-aware retrieval (T-222)

This is the security-critical part (ADR-017, SECURITY §16).

`match_knowledge_chunks(query_embedding, query_text, course_id?, k)` is a `security definer` SQL
function. It works out the caller's allowed scope **from `auth.uid()`**, never from parameters:

- course versions the caller is enrolled in (reusing `is_enrolled_in_version_course` /
  `can_read_lesson`);
- courses the caller owns (instructor), or all courses with `course.read_all` (admin test screen);
- the caller's organizations' documents (via `organization_members`);
- platform-wide documents.

The scope filter is in the `WHERE` clause **before** `ORDER BY embedding <=> query`. Nothing is
fetched first and filtered afterwards. Retrieval runs on the caller's session, never the service
role.

**Safeguards**

- **Filtered HNSW search:** with a selective `WHERE`, HNSW can return fewer than k rows. Enable
  `hnsw.iterative_scan`, or for a single-course query use an exact scan (one course is a few
  thousand chunks, which is fast).
- **Hybrid ranking:** merge vector results with keyword (`tsvector`) results using reciprocal rank
  fusion. Course content is full of exact terms (function names, acronyms) that embeddings alone
  handle poorly.
- **Relevance cutoff:** fetch about 8 candidates and drop weak matches. No good match means the
  model says it doesn't know, rather than answering from an unrelated chunk.

---

## 6. Generation and the AI Tutor (T-224, T-201)

- **Sources:** Groq has no built-in citations (ADR-040). Each retrieved chunk is numbered in the
  prompt (`[S1]`, `[S2]`, …) and the model is told to cite those markers. The app maps each marker
  back to its chunk, then to a lesson link (TEST_PLAN §15 "shows sources"); unknown markers are dropped.
- **Prompt order:** a fixed system prompt (grounding rules, refusal and escalation behaviour) comes
  first and the per-question chunks after it, so any provider-side prefix caching can reuse it.
- **Access (ADR-043):** the tutor is off until an admin turns it on for the user; `hasTutorAccess()` is checked
  on the server before every question.
- **Policy service**
  - If the learner has an in-progress graded assessment in that course, the tutor switches to
    **hint-only** mode (PRD §12).
  - Off-topic questions get a polite redirect.
  - Low confidence offers "Post this in the course discussion" (escalation, PRD §12).
- **Safety and cost**
  - New rate-limit buckets: `ai-tutor` and `ai-ingest` (SECURITY §18).
  - Every call is recorded in `ai_conversations` / `ai_messages` with tokens and cost (F-700).
  - Timeouts, provider errors and refusals produce a recoverable UI message, never a crash.
- **UI**
  - `/learner/ai-tutor` replaces the placeholder route.
  - A side panel in the course player receives the current lesson as context (DESIGN §14).
- **ADR-016:** the tutor only answers; it never writes course content.

---

## 7. Knowledge base admin (T-223)

`/admin/rag` replaces the placeholder route.

- Sources list with status and failure reasons; upload; re-index; delete.
- **Test retrieval:** run a query as a chosen scope and see the ranked chunks with scores. This is
  also the main debugging tool.
- Org admins get the same screen limited to their own organization.
- Upload, re-index and delete are audited (`recordAudit`).

---

## 8. Tests (T-225; TEST_PLAN §15 and §17)

- **Unit:** chunker (boundaries, overlap, heading prefixes), hash skip, citation-to-lesson
  mapping, policy decisions.
- **Integration** (local Supabase stack per CI job, ADR-034):
  - a learner in org A **cannot** retrieve org B's chunks or an unenrolled course's chunks;
  - a deleted source returns zero chunks;
  - re-indexing replaces chunks;
  - a failed document is visible with its error;
  - draft versions are never retrievable.
- **Provider fakes:** CI must not call paid APIs. The chat and embedding adapters get a
  deterministic fake for tests; real providers are exercised only in a manual smoke run.
- **Retrieval quality eval:** about 30 question → expected-lesson pairs on the seed courses,
  measuring whether the right lesson appears in the retrieved set. It catches regressions when
  chunk size or ranking is tuned.

---

## 9. Delivery order

| Step | Task | Needs |
| --- | --- | --- |
| 1 | Minimal T-200: chat and embedding adapters, `ai_*` usage tables, rate limits | Fakes only; real keys later |
| 2 | T-220: schema, pgvector (nullable), RLS | Done: ADR-042 |
| 3 | T-221: lesson ingestion, cron worker (minute sweep instead of a publish trigger) | Built; document upload + status view land with T-223 |
| 4 | T-222: retrieval function and isolation tests | Built (keyword ranking, ADR-042) |
| 5 | T-224 + T-201: tutor UI, citations, policy | Steps 1 and 4, Groq key, `api.groq.com` reachable |
| 6 | T-223: admin knowledge base and document uploads | Step 4 |
| 7 | T-225: remaining TEST_PLAN §17 items and the eval | All |

- Each step is its own PR. Each touches more than 3 files, so per CLAUDE.md the plan for each step
  is confirmed before it starts.
- Steps 1–4 can be built and tested with the fake providers before keys exist; only step 5 needs
  real ones.
