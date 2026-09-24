"use client";

import { useRef } from "react";
import { Bold, Heading2, Italic, Link2, List, ListOrdered, Quote } from "lucide-react";
import { cn } from "@/lib/utils/cn";

const btn =
  "inline-flex size-8 items-center justify-center rounded-control text-text-secondary hover:bg-border-subtle hover:text-text focus-visible:outline-2 focus-visible:outline-primary";

/**
 * Small contentEditable rich-text editor (bold, italic, heading, lists, quote, link). It only
 * produces markup; the server sanitizes on save and again on render, so nothing here is trusted.
 * `initialHtml` is applied once; the editor owns its content afterwards.
 */
export function RichTextEditor({
  initialHtml,
  onChange,
  disabled = false,
  label = "Lesson content",
}: {
  initialHtml: string;
  onChange: (html: string) => void;
  disabled?: boolean;
  label?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  function exec(command: string, value?: string) {
    if (disabled) return;
    ref.current?.focus();
    document.execCommand(command, false, value);
    onChange(ref.current?.innerHTML ?? "");
  }

  function addLink() {
    const url = window.prompt("Link address (https://…)");
    if (!url) return;
    try {
      if (new URL(url).protocol === "https:" || new URL(url).protocol === "http:") exec("createLink", url);
    } catch {
      /* ignore invalid URLs */
    }
  }

  return (
    <div className={cn("rounded-input border border-border bg-surface", disabled && "opacity-60")}>
      {/* mousedown is cancelled so clicking a button never steals focus or collapses the selection */}
      <div
        role="toolbar"
        aria-label="Formatting"
        onMouseDown={(e) => e.preventDefault()}
        className="flex flex-wrap gap-0.5 border-b border-border p-1"
      >
        <button type="button" className={btn} aria-label="Bold" onClick={() => exec("bold")} disabled={disabled}>
          <Bold className="size-4" aria-hidden="true" />
        </button>
        <button type="button" className={btn} aria-label="Italic" onClick={() => exec("italic")} disabled={disabled}>
          <Italic className="size-4" aria-hidden="true" />
        </button>
        <button type="button" className={btn} aria-label="Heading" onClick={() => exec("formatBlock", "h2")} disabled={disabled}>
          <Heading2 className="size-4" aria-hidden="true" />
        </button>
        <button type="button" className={btn} aria-label="Bulleted list" onClick={() => exec("insertUnorderedList")} disabled={disabled}>
          <List className="size-4" aria-hidden="true" />
        </button>
        <button type="button" className={btn} aria-label="Numbered list" onClick={() => exec("insertOrderedList")} disabled={disabled}>
          <ListOrdered className="size-4" aria-hidden="true" />
        </button>
        <button type="button" className={btn} aria-label="Quote" onClick={() => exec("formatBlock", "blockquote")} disabled={disabled}>
          <Quote className="size-4" aria-hidden="true" />
        </button>
        <button type="button" className={btn} aria-label="Link" onClick={addLink} disabled={disabled}>
          <Link2 className="size-4" aria-hidden="true" />
        </button>
      </div>
      <div
        ref={ref}
        role="textbox"
        aria-multiline="true"
        aria-label={label}
        contentEditable={!disabled}
        suppressContentEditableWarning
        onInput={(e) => onChange(e.currentTarget.innerHTML)}
        onPaste={(e) => {
          // Paste as plain text: no foreign styles or markup ever enter the editor.
          e.preventDefault();
          document.execCommand("insertText", false, e.clipboardData.getData("text/plain"));
        }}
        className="min-h-48 space-y-2 p-3 text-sm focus-visible:outline-2 focus-visible:outline-primary [&_a]:text-primary [&_a]:underline [&_blockquote]:border-l-4 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_h2]:text-lg [&_h2]:font-semibold [&_ol]:list-decimal [&_ol]:pl-6 [&_ul]:list-disc [&_ul]:pl-6"
        dangerouslySetInnerHTML={{ __html: initialHtml }}
      />
    </div>
  );
}
