import { useEffect, useState, type FormEvent } from "react";

import { SKILL_LIMITS, type Skill } from "@cot/shared";

import { api, type AgentHandle } from "../../lib/assistant-rpc";
import { errorText } from "../../lib/errors";

const EMPTY: Skill = { name: "", description: "", instructions: "" };

/** The user's skills: instructions the assistant loads when a task fits. */
export function SkillsSettings({
  agent,
  epoch
}: {
  agent: AgentHandle;
  epoch: number;
}) {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [draft, setDraft] = useState<Skill>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (epoch === 0) return;
    api(agent)
      .listSkills()
      .then(setSkills)
      .catch((e: unknown) => setError(errorText(e)));
  }, [agent, epoch]);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      setSkills(await api(agent).saveSkill(draft));
      setDraft(EMPTY);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card">
      <h2>Skills</h2>
      <p className="muted">
        Reusable instructions. The assistant sees each name and description, and
        loads the full text only when a request fits.
      </p>
      {skills.length === 0 ? (
        <p className="muted">No skills yet.</p>
      ) : (
        <ul className="list">
          {skills.map((skill) => (
            <li key={skill.name}>
              <div>
                <div className="font-medium">{skill.name}</div>
                <div className="muted small">{skill.description}</div>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="link-btn"
                  onClick={() => setDraft(skill)}
                >
                  Edit
                </button>
                <button
                  type="button"
                  className="link-btn"
                  onClick={() => {
                    api(agent)
                      .deleteSkill(skill.name)
                      .then(setSkills)
                      .catch((e: unknown) => setError(errorText(e)));
                  }}
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <form className="stack-form" onSubmit={(e) => void save(e)}>
        <input
          required
          value={draft.name}
          maxLength={SKILL_LIMITS.name}
          placeholder="weekly-report"
          onChange={(e) => setDraft({ ...draft, name: e.target.value })}
        />
        <input
          required
          value={draft.description}
          maxLength={SKILL_LIMITS.description}
          placeholder="When to use it"
          onChange={(e) => setDraft({ ...draft, description: e.target.value })}
        />
        <textarea
          required
          rows={6}
          value={draft.instructions}
          maxLength={SKILL_LIMITS.instructions}
          placeholder="Instructions (Markdown)"
          onChange={(e) => setDraft({ ...draft, instructions: e.target.value })}
        />
        <button type="submit" className="primary-btn" disabled={busy}>
          {busy ? "Saving…" : "Save skill"}
        </button>
      </form>
      {error && <p className="error">{error}</p>}
    </section>
  );
}
