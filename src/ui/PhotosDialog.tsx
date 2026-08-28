import { useRef, useState } from "react";
import { importPhotoFile } from "../file/photoImport";
import {
  PHOTO_BUDGET_BYTES,
  movePhoto,
  photoTitle,
  projectPhotos,
  removePhoto,
  totalPhotoBytes,
  updatePhoto,
} from "../model/photos";
import { addPhoto } from "../model/photos";
import { useStore } from "../state/store";

function megabytes(bytes: number): string {
  return `${(bytes / 1_000_000).toFixed(1)} MB`;
}

export function PhotosDialog({ onClose }: { onClose: () => void }) {
  const project = useStore((s) => s.project);
  const apply = useStore((s) => s.apply);
  const fileInput = useRef<HTMLInputElement>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const photos = projectPhotos(project);
  const bytes = totalPhotoBytes(project);

  async function take(files: FileList | null) {
    if (!files || files.length === 0) return;
    setBusy(true);
    const failed: string[] = [];
    for (const file of Array.from(files)) {
      const result = await importPhotoFile(file);
      if (result.ok) apply((p) => addPhoto(p, result.photo));
      else failed.push(result.error);
    }
    setErrors(failed);
    setBusy(false);
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-label="Reference photos"
        onClick={(e) => e.stopPropagation()}
      >
        <h2>Reference photos</h2>
        <p className="hint">
          Photos go on their own pages at the back of the exported PDF, so whoever reads the
          plan can see what the room actually looks like. They are stored inside the project
          file, and scaled down on the way in to keep that file a sensible size.
        </p>

        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          multiple
          data-testid="photo-input"
          style={{ display: "none" }}
          onChange={(e) => {
            void take(e.currentTarget.files);
            e.currentTarget.value = "";
          }}
        />

        <div className="modal-actions left">
          <button onClick={() => fileInput.current?.click()} disabled={busy}>
            {busy ? "Adding…" : "Add photos…"}
          </button>
          <span className="hint">
            {photos.length === 0
              ? "None yet."
              : `${photos.length} photo${photos.length === 1 ? "" : "s"}, ${megabytes(bytes)}`}
          </span>
        </div>

        {bytes > PHOTO_BUDGET_BYTES && (
          <p className="hint alert" data-testid="photo-budget-warning">
            These photos make the project file {megabytes(bytes)}. That is large to email,
            and the browser may stop keeping its own backup copy of your work. Save the
            file to disk yourself, or remove a few.
          </p>
        )}

        {errors.map((e) => (
          <p className="hint alert" key={e} data-testid="photo-error">
            {e}
          </p>
        ))}

        <ul className="photo-list">
          {photos.map((photo, i) => (
            <li key={photo.id} data-testid="photo-row">
              <img src={photo.dataUrl} alt={photoTitle(photo, i)} />
              <div className="photo-fields">
                <input
                  aria-label={`Caption for ${photo.name}`}
                  placeholder={`Photo ${i + 1}`}
                  value={photo.caption}
                  onChange={(e) =>
                    apply((p) => updatePhoto(p, photo.id, { caption: e.currentTarget.value }))
                  }
                />
                <span className="hint">{photo.name}</span>
              </div>
              <div className="photo-buttons">
                <button
                  aria-label={`Move ${photo.name} earlier`}
                  disabled={i === 0}
                  onClick={() => apply((p) => movePhoto(p, photo.id, -1))}
                >
                  ↑
                </button>
                <button
                  aria-label={`Move ${photo.name} later`}
                  disabled={i === photos.length - 1}
                  onClick={() => apply((p) => movePhoto(p, photo.id, 1))}
                >
                  ↓
                </button>
                <button
                  aria-label={`Remove ${photo.name}`}
                  onClick={() => apply((p) => removePhoto(p, photo.id))}
                >
                  ×
                </button>
              </div>
            </li>
          ))}
        </ul>

        <div className="modal-actions">
          <button className="primary" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
