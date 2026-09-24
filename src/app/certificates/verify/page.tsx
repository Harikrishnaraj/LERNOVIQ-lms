import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { normalizeCertificateCode } from "@/features/certificates/queries";

export const metadata: Metadata = {
  title: "Verify a certificate",
  description: "Check that a Modern LMS certificate is genuine.",
};

export default async function VerifyLookupPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  const { code } = await searchParams;
  const normalized = code ? normalizeCertificateCode(code) : null;
  if (normalized) redirect(`/certificates/verify/${normalized}`);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <span className="flex size-11 items-center justify-center rounded-card bg-primary-light text-primary">
          <ShieldCheck className="size-6" aria-hidden="true" />
        </span>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Verify a certificate</h1>
          <p className="text-text-secondary">Enter the certificate ID printed on the certificate.</p>
        </div>
      </div>

      <form method="get" action="/certificates/verify" className="space-y-4">
        <Input
          label="Certificate ID"
          name="code"
          defaultValue={code ?? ""}
          placeholder="MLC-XXXX-XXXX-XXXX-XXXX"
          autoComplete="off"
          maxLength={40}
          error={code && !normalized ? "That is not a valid certificate ID." : undefined}
        />
        <Button type="submit">Verify</Button>
      </form>
    </div>
  );
}
