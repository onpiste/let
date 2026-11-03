/**
 * The email a `sendEmail` call would send, shown whole on its chip so the
 * owner reads exactly what goes out before approving. Mirrors
 * EmailDraftView.swift.
 */
export function EmailDraft({ input }: { input: Record<string, unknown> }) {
  const text = (key: string) =>
    typeof input[key] === "string" ? input[key] : "";
  return (
    <div className="email-draft">
      <div>
        <span className="muted">To</span> {text("to")}
      </div>
      <div>
        <span className="muted">Subject</span> {text("subject")}
      </div>
      {/* Model output, rendered as text: never as HTML. */}
      <div className="email-draft-body">{text("body")}</div>
    </div>
  );
}
