import { useEffect, useRef, useState } from "react";

import { Plus } from "../../components/icons";

const ACCEPT =
  "text/*,image/*,application/pdf,.md,.csv,.json,.yaml,.yml,.log,.py,.js,.ts,.tsx,.go,.rs,.java,.sql";

/**
 * The round plus button left of the composer pill. It opens a small menu to
 * choose files or take a photo with the camera, like the plus `Menu` in
 * `ComposerView.swift`. Phone browsers open the camera for `capture`; desktop
 * browsers ignore it and show an image picker.
 */
export function AttachMenu({
  onAttach,
  onPhoto
}: {
  onAttach: (files: File[]) => void;
  onPhoto: (file: File) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const escape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  const pick = (input: HTMLInputElement | null) => {
    setOpen(false);
    input?.click();
  };

  return (
    <div className="attach-menu" ref={rootRef}>
      <input
        ref={fileRef}
        type="file"
        multiple
        hidden
        accept={ACCEPT}
        onChange={(e) => {
          onAttach(Array.from(e.target.files ?? []));
          e.target.value = "";
        }}
      />
      <input
        ref={cameraRef}
        type="file"
        hidden
        accept="image/*"
        capture="environment"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onPhoto(file);
          e.target.value = "";
        }}
      />
      <button
        type="button"
        className="attach-btn"
        onClick={() => setOpen(!open)}
        aria-label="Attach files"
        aria-haspopup="menu"
        aria-expanded={open}
        title="Attach files"
      >
        <Plus />
      </button>
      {open && (
        <div className="attach-popover" role="menu">
          <button
            type="button"
            role="menuitem"
            onClick={() => pick(fileRef.current)}
          >
            📄 Choose file
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => pick(cameraRef.current)}
          >
            📷 Take photo
          </button>
        </div>
      )}
    </div>
  );
}
