import type { Metadata } from "next";
import Link from "next/link";
import { Award } from "lucide-react";
import { CopyLinkButton } from "@/components/certificates/copy-link-button";
import { EmptyState } from "@/components/feedback/states";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getMyCertificates } from "@/features/certificates/queries";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Certificates" };

const dateFormat = new Intl.DateTimeFormat("en-US", { dateStyle: "long", timeZone: "UTC" });

export default async function CertificatesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const certificates = user ? await getMyCertificates(supabase, user.id) : [];

  return (
    <>
      <PageHeader
        title="Certificates"
        description="Certificates you have earned, with links anyone can use to verify them."
      />

      {certificates.length === 0 ? (
        <EmptyState
          icon={Award}
          title="No certificates yet"
          description="Complete a course, including any assessments, and your certificate appears here."
          action={
            <Link href="/learner/my-learning" className={buttonClasses()}>
              Go to My Learning
            </Link>
          }
        />
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {certificates.map((c) => (
            <li key={c.id}>
              <Card className="flex h-full flex-col gap-3 p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="font-semibold">{c.courseTitle}</h2>
                    <p className="text-sm text-text-secondary">
                      Issued {dateFormat.format(new Date(c.issuedAt))}
                      {c.instructorName ? ` · ${c.instructorName}` : ""}
                    </p>
                  </div>
                  {c.status === "revoked" ? (
                    <Badge tone="danger" dot>
                      Revoked
                    </Badge>
                  ) : (
                    <Badge tone="success" dot>
                      Valid
                    </Badge>
                  )}
                </div>
                <p className="text-sm">
                  <span className="text-text-secondary">Certificate ID: </span>
                  <code className="font-mono">{c.code}</code>
                </p>
                <div className="mt-auto flex flex-wrap gap-2">
                  <Link
                    href={`/certificates/verify/${c.code}`}
                    className={buttonClasses({ size: "sm" })}
                  >
                    View certificate
                  </Link>
                  <CopyLinkButton path={`/certificates/verify/${c.code}`} />
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
