import { isUuid } from "./document-rules";
import { SOURCE_KINDS, SOURCE_STATUSES, type SourceKind, type SourceStatus } from "./admin";

// Parsing of the /admin/knowledge URL (T-223): the list filters and the test-retrieval form both
// live in the query string, so every state is a shareable link and needs no client state.

type Params = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export interface KnowledgeQuery {
  status: SourceStatus | "";
  kind: SourceKind | "";
  q: string;
  page: number;
  /** Test retrieval: the question, an optional course and an optional organization. */
  test: string;
  testCourse: string;
  testOrganization: string;
}

export function parseKnowledgeQuery(params: Params): KnowledgeQuery {
  const status = one(params.status);
  const kind = one(params.kind);
  const page = Number.parseInt(one(params.page), 10);
  const course = one(params.tc);
  const organization = one(params.to);
  return {
    status: (SOURCE_STATUSES as readonly string[]).includes(status) ? (status as SourceStatus) : "",
    kind: (SOURCE_KINDS as readonly string[]).includes(kind) ? (kind as SourceKind) : "",
    q: one(params.q).trim().slice(0, 100),
    page: Number.isFinite(page) && page > 0 && page < 10_000 ? page : 1,
    test: one(params.tq).trim().slice(0, 500),
    testCourse: isUuid(course) ? course : "",
    testOrganization: isUuid(organization) ? organization : "",
  };
}
