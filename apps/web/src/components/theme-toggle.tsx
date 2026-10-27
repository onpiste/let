import { useState } from "react";

import { Moon, Sun } from "./icons";

/** Flips light/dark mode; index.html applies the saved mode before render. */
export function ThemeToggle() {
  const [dark, setDark] = useState(
    () => document.documentElement.getAttribute("data-mode") === "dark"
  );
  const toggle = () => {
    const mode = dark ? "light" : "dark";
    setDark(!dark);
    document.documentElement.setAttribute("data-mode", mode);
    document.documentElement.style.colorScheme = mode;
    try {
      localStorage.setItem("theme", mode);
    } catch {}
  };
  return (
    <button className="icon-btn" onClick={toggle} aria-label="Toggle theme">
      {dark ? <Sun /> : <Moon />}
    </button>
  );
}
