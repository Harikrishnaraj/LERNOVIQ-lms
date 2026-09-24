// Upload validation by file CONTENT, never by the client-supplied name or MIME type.

export type ImageKind = { mime: "image/png" | "image/jpeg" | "image/webp"; ext: "png" | "jpg" | "webp" };

/** Detects PNG / JPEG / WebP from magic bytes; null for anything else (SVG, GIF, HTML, ...). */
export function sniffImage(bytes: Uint8Array): ImageKind | null {
  const b = bytes;
  if (
    b.length >= 8 &&
    b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 &&
    b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a
  ) {
    return { mime: "image/png", ext: "png" };
  }
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) {
    return { mime: "image/jpeg", ext: "jpg" };
  }
  if (
    b.length >= 12 &&
    b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && // RIFF
    b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50 // WEBP
  ) {
    return { mime: "image/webp", ext: "webp" };
  }
  return null;
}

export const MAX_THUMBNAIL_BYTES = 2 * 1024 * 1024;
