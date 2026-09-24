"use client";

import { useState } from "react";
import { Check, Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Copies the public verification URL (built in the browser from the current origin). */
export function CopyLinkButton({ path }: { path: string }) {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);

  async function copy() {
    setFailed(false);
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${path}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setFailed(true);
    }
  }

  return (
    <div className="inline-flex items-center gap-2">
      <Button variant="secondary" size="sm" onClick={copy}>
        {copied ? (
          <Check className="size-4" aria-hidden="true" />
        ) : (
          <Link2 className="size-4" aria-hidden="true" />
        )}
        {copied ? "Link copied" : "Copy verification link"}
      </Button>
      {failed && (
        <span role="alert" className="text-xs text-danger-text">
          Copy failed. Use the verification link instead.
        </span>
      )}
    </div>
  );
}
