import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import type { OutputInfo } from "sharp";

export const UPLOAD_DIR = process.env.UPLOAD_DIR ?? "./uploads";

/** Longest edge of the copy shown in the lightbox. */
const DISPLAY_MAX_EDGE = 2000;
/** Longest edge of the copy shown in the grid. */
const THUMB_MAX_EDGE = 400;

/** `YYYY/MM/<random>` — never the filename the browser sent. */
const STORAGE_KEY_PATTERN = /^\d{4}\/\d{2}\/[a-f0-9]{16}$/;

export type PhotoVariant = "display" | "thumb";

export class UnsupportedImageError extends Error {
  constructor(message = "Dieses Bildformat wird nicht unterstützt") {
    super(message);
    this.name = "UnsupportedImageError";
  }
}

/**
 * The browser's Content-Type is user input, so the format is decided by the
 * first bytes of the file instead.
 */
function sniffImageType(bytes: Uint8Array): "jpeg" | "png" | "webp" | null {
  if (bytes.length < 12) return null;

  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "jpeg";
  }
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return "png";
  }
  // "RIFF" .... "WEBP"
  const ascii = (offset: number, text: string) =>
    [...text].every((char, i) => bytes[offset + i] === char.charCodeAt(0));
  if (ascii(0, "RIFF") && ascii(8, "WEBP")) {
    return "webp";
  }
  return null;
}

function newStorageKey(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const random = crypto.randomUUID().replaceAll("-", "").slice(0, 16);
  return `${year}/${month}/${random}`;
}

/**
 * Resolves a storage key to a path inside UPLOAD_DIR. The key is validated
 * against a strict pattern first, so a crafted key cannot escape the upload
 * directory.
 */
export function resolvePhotoPath(
  storageKey: string,
  variant: PhotoVariant,
): string | null {
  if (!STORAGE_KEY_PATTERN.test(storageKey)) {
    return null;
  }
  const suffix = variant === "thumb" ? ".thumb.webp" : ".webp";
  return path.join(UPLOAD_DIR, `${storageKey}${suffix}`);
}

export type StoredPhoto = {
  storageKey: string;
  width: number;
  height: number;
  bytes: number;
};

/**
 * Re-encodes an upload into a capped display copy and a thumbnail, both WebP,
 * and writes them to disk. The original bytes are never stored: re-encoding
 * shrinks a phone photo by roughly 10x and drops all EXIF (including GPS).
 */
export async function savePhoto(input: ArrayBuffer): Promise<StoredPhoto> {
  const bytes = new Uint8Array(input);
  if (sniffImageType(bytes) === null) {
    throw new UnsupportedImageError();
  }

  const storageKey = newStorageKey();
  const displayPath = resolvePhotoPath(storageKey, "display")!;
  const thumbPath = resolvePhotoPath(storageKey, "thumb")!;

  await mkdir(path.dirname(displayPath), { recursive: true });

  let display: { data: Buffer; info: OutputInfo };
  let thumb: Buffer;
  try {
    display = await sharp(bytes)
      .rotate() // honour the EXIF orientation before it is stripped
      .resize({
        width: DISPLAY_MAX_EDGE,
        height: DISPLAY_MAX_EDGE,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: 80 })
      .toBuffer({ resolveWithObject: true });

    thumb = await sharp(bytes)
      .rotate()
      .resize({
        width: THUMB_MAX_EDGE,
        height: THUMB_MAX_EDGE,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: 70 })
      .toBuffer();
  } catch {
    throw new UnsupportedImageError("Das Bild konnte nicht gelesen werden");
  }

  await writeFile(displayPath, display.data);
  try {
    await writeFile(thumbPath, thumb);
  } catch (error) {
    // Never leave a display copy without its thumbnail behind.
    await unlink(displayPath).catch(() => {});
    throw error;
  }

  return {
    storageKey,
    width: display.info.width,
    height: display.info.height,
    bytes: display.info.size,
  };
}

/** Removes both variants. A missing file is not an error. */
export async function deletePhotoFiles(storageKey: string): Promise<void> {
  for (const variant of ["display", "thumb"] as const) {
    const filePath = resolvePhotoPath(storageKey, variant);
    if (filePath) {
      await unlink(filePath).catch(() => {});
    }
  }
}
