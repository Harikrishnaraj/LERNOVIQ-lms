import Image from "next/image";
import primaryLogo from "@/assets/brand/lernoviq-logo.webp";
import secondaryMark from "@/assets/brand/lernoviq-mark.webp";
import { cn } from "@/lib/utils/cn";

/*
 * The only way to show the LERNOVIQ logo (docs/brand/LERNOVIQ_Brand_Guidelines.pdf, v1.1).
 * Approved artwork only: the L emblem never appears alone and the wordmark is never retyped.
 * The digital minimum widths (§3.2) are enforced, and the clear space X — the height of the
 * smallest square in the emblem (§3.1) — is built in as padding so nothing can enter it.
 * Use it on white or very light backgrounds only (§3.3); there is no reversed artwork yet.
 */
const LOGOS = {
  /** Full lockup: emblem, wordmark, legal name and tagline. Preferred whenever space allows. */
  primary: { src: primaryLogo, minWidth: 120, clearSpace: 0.032 },
  /** Compact lockup: emblem with the wordmark below it. */
  secondary: { src: secondaryMark, minWidth: 96, clearSpace: 0.06 },
} as const;

export function BrandLogo({
  variant = "primary",
  width,
  className,
}: {
  variant?: keyof typeof LOGOS;
  /** Rendered width in px; raised to the brand minimum when smaller. */
  width: number;
  className?: string;
}) {
  const logo = LOGOS[variant];
  const w = Math.max(width, logo.minWidth);
  return (
    <span
      className={cn("inline-block shrink-0", className)}
      style={{ padding: Math.ceil(w * logo.clearSpace) }}
    >
      <Image
        src={logo.src}
        alt="LERNOVIQ"
        width={w}
        height={Math.round((w * logo.src.height) / logo.src.width)}
        loading="eager"
      />
    </span>
  );
}
