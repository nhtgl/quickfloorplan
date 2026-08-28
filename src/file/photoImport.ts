import { MAX_PHOTO_EDGE, PHOTO_QUALITY, fitDimensions, makePhoto } from "../model/photos";
import type { Photo } from "../model/types";

export type ImportResult = { ok: true; photo: Photo } | { ok: false; error: string };

const ACCEPTED = /^image\/(jpeg|png|webp|gif|bmp|heic|heif)$/i;

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("The file could not be read."));
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("That file is not an image this browser can read."));
    img.src = src;
  });
}

/**
 * Read a picked file into a downscaled JPEG data URI.
 *
 * Photos are stored inside the project file so a project stays one thing you can send to
 * someone. A phone photo straight off the camera would bloat that file to tens of
 * megabytes, so everything is re-encoded down to a size that is still clear enough to
 * read a room from.
 */
export async function importPhotoFile(file: File): Promise<ImportResult> {
  if (!ACCEPTED.test(file.type)) {
    return { ok: false, error: `"${file.name}" is not an image.` };
  }

  let img: HTMLImageElement;
  try {
    img = await loadImage(await readAsDataUrl(file));
  } catch (err) {
    return { ok: false, error: `"${file.name}": ${(err as Error).message}` };
  }

  const box = fitDimensions(
    img.naturalWidth,
    img.naturalHeight,
    MAX_PHOTO_EDGE,
    MAX_PHOTO_EDGE,
  );
  const width = Math.max(1, Math.round(box.width));
  const height = Math.max(1, Math.round(box.height));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return { ok: false, error: "This browser cannot process images." };
  // A white ground, so a transparent PNG does not come out black once flattened to JPEG.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(img, 0, 0, width, height);

  return {
    ok: true,
    photo: makePhoto({
      name: file.name,
      caption: "",
      dataUrl: canvas.toDataURL("image/jpeg", PHOTO_QUALITY),
      width,
      height,
    }),
  };
}
