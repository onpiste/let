/** A user-written instruction set the assistant loads on demand. */
export type Skill = {
  /** Lowercase slug; the assistant calls useSkill with it. */
  name: string;
  /** One line telling the assistant when to use the skill. */
  description: string;
  /** Markdown instructions, loaded only when the skill is used. */
  instructions: string;
};

export const SKILL_LIMITS = {
  name: 64,
  description: 300,
  instructions: 8000,
  count: 30
} as const;

const NAME = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** Trims and checks a skill; throws a user-readable error if it's invalid. */
export function validateSkill(skill: Skill): Skill {
  const name = skill.name.trim();
  const description = skill.description.trim();
  const instructions = skill.instructions.trim();
  if (!name || name.length > SKILL_LIMITS.name || !NAME.test(name))
    throw new Error(
      "Name the skill with lowercase letters, digits and hyphens."
    );
  if (!description || description.length > SKILL_LIMITS.description)
    throw new Error(
      `Describe when to use it in up to ${SKILL_LIMITS.description} characters.`
    );
  if (!instructions || instructions.length > SKILL_LIMITS.instructions)
    throw new Error(
      `Instructions must be 1-${SKILL_LIMITS.instructions} characters.`
    );
  return { name, description, instructions };
}
