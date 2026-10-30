import { tool } from "ai";
import { z } from "zod";

import type { Skill } from "@cot/shared";

export type SkillReader = {
  list(): Skill[];
};

/** Loads a user's skill on demand; the prompt lists only names. */
export function skillTools(skills: SkillReader) {
  return {
    useSkill: tool({
      description:
        "Load the full instructions of one of the user's skills by name.",
      inputSchema: z.object({
        name: z.string().describe("The skill name from the prompt")
      }),
      execute: async ({ name }) => {
        const skill = skills.list().find((s) => s.name === name);
        return skill
          ? skill.instructions
          : `No skill named ${name}. Known: ${skills
              .list()
              .map((s) => s.name)
              .join(", ")}.`;
      }
    })
  };
}
