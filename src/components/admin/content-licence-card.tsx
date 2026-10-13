"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { Download, Loader2, X } from "lucide-react";
import {
  addLicenceCourseAction,
  removeLicenceCourseAction,
  searchDispatchableCoursesAction,
  setLicenceRevokedAction,
} from "@/features/content-server/actions";
import type { ContentLicenceView, DispatchableCourse } from "@/features/content-server/queries";
import { expiryInputValue } from "@/features/content-server/rules";
import { Badge } from "@/components/ui/badge";
import { Button, buttonClasses } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { FIELD } from "./content-client-list";
import { ContentLicenceForm } from "./content-licence-form";

const STATUS = {
  active: { tone: "success", label: "Active" },
  revoked: { tone: "danger", label: "Revoked" },
  expired: { tone: "warning", label: "Expired" },
} as const;

const dateFormat = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

export function ContentLicenceCard({
  clientId,
  licence,
  dispatchAvailable,
}: {
  clientId: string;
  licence: ContentLicenceView;
  /** False when no separate content address is configured: packages cannot be built (ADR-041). */
  dispatchAvailable: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [confirmRevoke, setConfirmRevoke] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<DispatchableCourse[] | null>(null);
  const searchId = useId();
  const status = STATUS[licence.status];
  const headingId = `licence-${licence.id}`;

  async function run(fn: () => Promise<{ ok: true } | { ok: false; error: string }>) {
    setBusy(true);
    setError(null);
    const res = await fn();
    setBusy(false);
    if (!res.ok) setError(res.error);
    else router.refresh();
    return res.ok;
  }

  async function search(e: React.FormEvent) {
    e.preventDefault();
    setResults(await searchDispatchableCoursesAction(q));
  }

  const onLicence = new Set(licence.courses.map((c) => c.courseId));

  return (
    <Card>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 id={headingId} className="text-base font-semibold">
                {licence.name}
              </h3>
              <Badge tone={status.tone} dot>
                {status.label}
              </Badge>
            </div>
            <dl className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-text-secondary">
              <div className="flex gap-1">
                <dt>Seats</dt>
                <dd className="font-medium text-text tabular-nums">
                  {licence.seatsUsed} / {licence.seatLimit ?? "unlimited"}
                </dd>
              </div>
              <div className="flex gap-1">
                <dt>Expires</dt>
                <dd className="font-medium text-text">
                  {licence.expiresAt ? dateFormat.format(new Date(licence.expiresAt)) : "Never"}
                </dd>
              </div>
            </dl>
            <p className="font-mono text-xs break-all text-text-secondary">
              {licence.allowedOrigins.join(", ")}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => setEditing((v) => !v)}
              aria-expanded={editing}
            >
              Edit
            </Button>
            {licence.revokedAt ? (
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={busy}
                onClick={() => run(() => setLicenceRevokedAction(clientId, licence.id, false))}
              >
                Reinstate
              </Button>
            ) : confirmRevoke ? (
              <>
                <Button
                  type="button"
                  size="sm"
                  variant="destructive"
                  disabled={busy}
                  onClick={async () => {
                    await run(() => setLicenceRevokedAction(clientId, licence.id, true));
                    setConfirmRevoke(false);
                  }}
                >
                  Confirm revoke
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => setConfirmRevoke(false)}
                  disabled={busy}
                >
                  Cancel
                </Button>
              </>
            ) : (
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => setConfirmRevoke(true)}
              >
                Revoke
              </Button>
            )}
          </div>
        </div>
        {confirmRevoke && (
          <p className="text-xs text-text-secondary">
            Learners will not be able to open these courses from the customer&apos;s LMS until you
            reinstate the licence.
          </p>
        )}

        {editing && (
          <ContentLicenceForm
            clientId={clientId}
            licenceId={licence.id}
            initial={{
              name: licence.name,
              seatLimit: licence.seatLimit ? String(licence.seatLimit) : "",
              expiresOn: expiryInputValue(licence.expiresAt),
              allowedOrigins: licence.allowedOrigins.join("\n"),
            }}
            onDone={() => setEditing(false)}
          />
        )}

        <div className="space-y-2">
          <h4 className="text-sm font-semibold">Courses</h4>
          {licence.courses.length === 0 ? (
            <p className="text-sm text-text-secondary">
              No courses on this licence yet. Search below to add one.
            </p>
          ) : (
            <ul className="divide-y divide-border-subtle rounded-control border border-border">
              {licence.courses.map((c) => (
                <li
                  key={c.courseId}
                  className="flex flex-wrap items-center justify-between gap-2 p-2.5 text-sm"
                >
                  <span className="min-w-0 font-medium">{c.title}</span>
                  <span className="flex flex-wrap items-center gap-2">
                    {dispatchAvailable && (
                      <a
                        href={`/admin/content-server/${clientId}/dispatch/${licence.id}/${c.courseId}`}
                        className={buttonClasses({ variant: "secondary", size: "sm" })}
                        download
                      >
                        <Download className="size-3.5" aria-hidden="true" />
                        Download package<span className="sr-only"> for {c.title}</span>
                      </a>
                    )}
                    {confirmRemove === c.courseId ? (
                      <>
                        <Button
                          type="button"
                          size="sm"
                          variant="destructive"
                          disabled={busy}
                          onClick={async () => {
                            await run(() =>
                              removeLicenceCourseAction(clientId, licence.id, c.courseId),
                            );
                            setConfirmRemove(null);
                          }}
                        >
                          Confirm remove
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          onClick={() => setConfirmRemove(null)}
                          disabled={busy}
                        >
                          Cancel
                        </Button>
                      </>
                    ) : (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => setConfirmRemove(c.courseId)}
                      >
                        <X className="size-3.5" aria-hidden="true" />
                        <span className="sr-only">Remove {c.title}</span>
                      </Button>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {confirmRemove && (
            <p className="text-xs text-text-secondary">
              Packages already handed out for this course will stop working.
            </p>
          )}

          <form
            onSubmit={search}
            className="flex flex-wrap items-end gap-2"
            aria-label={`Add a course to ${licence.name}`}
          >
            <label
              className="flex flex-col gap-1 text-xs font-medium text-text-secondary"
              htmlFor={searchId}
            >
              Find a SCORM 1.2 course
              <input
                id={searchId}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Course title"
                className={`min-w-56 ${FIELD}`}
              />
            </label>
            <Button type="submit" size="sm" variant="secondary">
              Search
            </Button>
          </form>
          {results &&
            (results.length === 0 ? (
              <p className="text-sm text-text-secondary">
                No published course with a SCORM 1.2 lesson matches that.
              </p>
            ) : (
              <ul className="divide-y divide-border-subtle rounded-control border border-border">
                {results.map((r) => (
                  <li
                    key={r.courseId}
                    className="flex flex-wrap items-center justify-between gap-2 p-2.5 text-sm"
                  >
                    <span className="min-w-0">
                      <span className="font-medium">{r.title}</span>
                      <span className="ml-2 text-text-secondary">launches “{r.lessonTitle}”</span>
                    </span>
                    {onLicence.has(r.courseId) ? (
                      <span className="text-text-secondary">On this licence</span>
                    ) : (
                      <Button
                        type="button"
                        size="sm"
                        disabled={busy}
                        onClick={() =>
                          run(() => addLicenceCourseAction(clientId, licence.id, r.courseId))
                        }
                      >
                        Add<span className="sr-only"> {r.title}</span>
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            ))}
        </div>
        {busy && (
          <Loader2 className="size-4 animate-spin text-text-secondary" aria-label="Working" />
        )}
        {error && (
          <p role="alert" className="text-sm text-danger-text">
            {error}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
