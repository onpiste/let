import { SKILL_LIMITS, validateSkill, type Skill } from "@cot/shared";

import type { AssistantStore } from "./store";

/** Validates and stores a skill, then returns the updated list. */
export function saveSkill(store: AssistantStore, skill: Skill) {
  const valid = validateSkill(skill);
  const all = store.listSkills();
  if (
    all.length >= SKILL_LIMITS.count &&
    !all.some((s) => s.name === valid.name)
  )
    throw new Error(`You can keep up to ${SKILL_LIMITS.count} skills.`);
  store.saveSkill(valid);
  return store.listSkills();
}

export function deleteSkill(store: AssistantStore, name: string) {
  store.removeSkill(name);
  return store.listSkills();
}
