import type { User } from "@cot/shared";

import { greeting } from "../../lib/greeting";

const SUGGESTIONS = [
  "帮我规划一下今天要做的事",
  "Remind me in 10 minutes to stretch",
  "我叫什么名字？你还记得我什么？",
  "Help me write a polite follow-up email"
];

/** The greeting and starter prompts shown before the first message. */
export function EmptyState({
  user,
  onSuggestion
}: {
  user: User;
  onSuggestion: (text: string) => void;
}) {
  return (
    <div className="hero">
      <h1 className="hero-title">
        {greeting()}, {user.name.split(" ")[0]}
      </h1>
      <p className="hero-sub">
        I'm Cot, your personal assistant. What's on your mind?
      </p>
      <div className="suggestions">
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            className="suggestion"
            onClick={() => onSuggestion(s)}
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}
