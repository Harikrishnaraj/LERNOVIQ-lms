"use client";

import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  registerKnowledgeDocument,
  requestKnowledgeUpload,
} from "@/features/knowledge/admin-actions";
import {
  DOCUMENT_ACCEPT,
  DOCUMENT_TYPES_LABEL,
  MAX_DOCUMENT_TITLE,
  validateDocumentFile,
} from "@/features/knowledge/document-rules";
import { createClient } from "@/lib/supabase/client";

interface Props {
  organizations: readonly { id: string; name: string }[];
}

/**
 * Uploads a document straight to private storage with a one-time server-issued ticket, then asks
 * the server to verify the stored bytes and queue indexing (F-800). Everything is re-checked on
 * the server; the checks here only save a round trip.
 */
export function KnowledgeUploadForm({ organizations }: Props) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const file = fileRef.current?.files?.[0];
    setError(null);
    setNotice(null);
    if (!file || file.name === "") {
      setError("Choose a file to upload.");
      return;
    }
    const meta = { name: file.name, size: file.size, type: file.type };
    const local = validateDocumentFile(meta);
    if (!local.ok) {
      setError(local.error);
      return;
    }
    const input = {
      ...meta,
      title: String(data.get("title") ?? ""),
      organizationId: String(data.get("organizationId") ?? ""),
    };

    setBusy(true);
    try {
      const ticket = await requestKnowledgeUpload(input);
      if (!ticket.ok) {
        setError(ticket.error);
        return;
      }
      const { error: uploadError } = await createClient()
        .storage.from(ticket.bucket)
        .uploadToSignedUrl(ticket.path, ticket.token, file, { contentType: ticket.contentType });
      if (uploadError) {
        setError("The upload failed. Please try again.");
        return;
      }
      const result = await registerKnowledgeDocument({ ...input, path: ticket.path });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      formRef.current?.reset();
      setNotice("Uploaded. The document is queued and will be searchable once it is indexed.");
      router.refresh();
    } catch {
      setError("The upload failed. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form ref={formRef} onSubmit={onSubmit} className="space-y-4" noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="knowledge-file" className="text-sm font-medium text-text">
            Document
          </label>
          <input
            ref={fileRef}
            id="knowledge-file"
            name="file"
            type="file"
            accept={DOCUMENT_ACCEPT}
            disabled={busy}
            aria-describedby="knowledge-file-hint"
            className="block w-full rounded-input border border-border bg-surface text-sm text-text file:mr-3 file:h-10 file:border-0 file:bg-border-subtle file:px-3 file:text-sm file:font-medium file:text-text"
          />
          <p id="knowledge-file-hint" className="text-xs text-text-secondary">
            {DOCUMENT_TYPES_LABEL}, up to 10 MB.
          </p>
        </div>
        <Input
          label="Title (optional)"
          name="title"
          maxLength={MAX_DOCUMENT_TITLE}
          disabled={busy}
          hint="Shown with its passages. Defaults to the file name."
        />
        <Select
          label="Who can the AI Tutor use it for?"
          name="organizationId"
          disabled={busy}
          defaultValue=""
          options={[
            { value: "", label: "Everyone (platform-wide)" },
            ...organizations.map((o) => ({ value: o.id, label: `Only members of ${o.name}` })),
          ]}
        />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" loading={busy}>
          {!busy && <Upload className="size-4" aria-hidden="true" />}
          {busy ? "Uploading…" : "Upload document"}
        </Button>
        <p role="status" aria-live="polite" className="text-sm text-success-text">
          {notice}
        </p>
      </div>
      {error && (
        <p role="alert" className="text-sm text-danger-text">
          {error}
        </p>
      )}
    </form>
  );
}
