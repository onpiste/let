import { HARNESSES, type HarnessId as Harness } from "@cot/shared";

export function HarnessSwitch({
  value,
  onChange
}: {
  value: Harness;
  onChange: (h: Harness) => void;
}) {
  return (
    <fieldset className="harness" aria-label="Agent harness">
      {(Object.keys(HARNESSES) as Harness[]).map((h) => (
        <button
          key={h}
          type="button"
          aria-pressed={value === h}
          className={value === h ? "on" : ""}
          onClick={() => onChange(h)}
        >
          {HARNESSES[h].label}
        </button>
      ))}
    </fieldset>
  );
}
