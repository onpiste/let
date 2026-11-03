import { useState } from "react";

/**
 * A user message being edited in place of its bubble. Sending replaces the
 * message and everything after it with a new answer. Mirrors `MessageEditView`
 * in `MessageRow.swift`.
 */
export function MessageEdit({
  text,
  hasFiles,
  onSave,
  onCancel
}: {
  text: string;
  /** The message keeps its attachments, so it may be sent without text. */
  hasFiles: boolean;
  onSave: (text: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(text);
  const canSave = value.trim() !== "" || hasFiles;

  const save = () => {
    if (canSave) onSave(value);
  };

  return (
    <form
      className="msg-edit"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <textarea
        // oxlint-disable-next-line jsx-a11y/no-autofocus -- the user asked to edit
        autoFocus
        aria-label="Edit message"
        rows={Math.min(8, Math.max(2, value.split("\n").length))}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") onCancel();
          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            save();
          }
        }}
      />
      <div className="msg-edit-actions">
        <button type="button" className="link-btn" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="primary-btn" disabled={!canSave}>
          Send
        </button>
      </div>
    </form>
  );
}
