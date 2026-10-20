"use client";

import { useEffect, useState } from "react";

const THEMES = [
  ["bento", "Bento Grid"],
  ["cosmic", "Cosmic Cyber"],
  ["swiss", "Swiss Architect"],
  ["aqua", "Aqua Web 2.0"],
  ["brutalist", "Pop Brutalist"],
  ["steel", "Steel Tactical"],
  ["parchment", "Parchment"],
] as const;

export function ThemePicker() {
  const [theme, setTheme] = useState("cosmic");
  const [mode, setMode] = useState("dark");

  useEffect(() => {
    const storedTheme = window.localStorage.getItem("quire-console-theme") || "cosmic";
    const storedMode = window.localStorage.getItem("quire-console-mode") || "dark";
    setTheme(storedTheme);
    setMode(storedMode);
    document.body.classList.add("is-console");
    document.body.dataset.theme = storedTheme;
    document.body.dataset.mode = storedMode;
    return () => {
      document.body.classList.remove("is-console");
      delete document.body.dataset.theme;
      delete document.body.dataset.mode;
    };
  }, []);

  function apply(nextTheme: string, nextMode: string) {
    setTheme(nextTheme);
    setMode(nextMode);
    document.body.dataset.theme = nextTheme;
    document.body.dataset.mode = nextMode;
    window.localStorage.setItem("quire-console-theme", nextTheme);
    window.localStorage.setItem("quire-console-mode", nextMode);
  }

  return (
    <div className="themebar" role="group" aria-label="Console theme">
      {THEMES.map(([id, label]) => (
        <button key={id} type="button" aria-pressed={theme === id} onClick={() => apply(id, mode)}>
          {label}
        </button>
      ))}
      <button type="button" aria-pressed={mode === "dark"} onClick={() => apply(theme, mode === "dark" ? "light" : "dark")}>
        {mode === "dark" ? "Dark" : "Light"}
      </button>
    </div>
  );
}
