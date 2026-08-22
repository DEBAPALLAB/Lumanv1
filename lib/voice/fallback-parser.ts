"use client";

/**
 * The offline safety net.
 *
 * The model at /api/voice/agent does the real understanding — it sees the
 * desktop snapshot, handles misheard words, plurals and follow-ups. This file
 * is what runs when that request cannot be made at all: no network, no key
 * configured, or the route erroring.
 *
 * Deliberately narrow. It recognises the handful of phrasings that are
 * unambiguous enough to act on without a model ("open tasks", "close
 * everything", "dark mode") and returns `none` for anything else rather than
 * guessing. A local parser that tries to be clever produces confident wrong
 * actions, which is worse than saying it is offline.
 */

import { normalize } from "./resolve";
import type { AgentAction, AgentTarget, LayoutName } from "./types";

/** Spoken names for each window kind, including the ones people actually say. */
const TARGET_WORDS: { words: string[]; target: AgentTarget }[] = [
  { words: ["task", "tasks", "todo", "todos", "to do"], target: "tasks" },
  { words: ["calendar", "schedule", "agenda"], target: "calendar" },
  { words: ["file", "files", "drive", "documents"], target: "files" },
  { words: ["setting", "settings", "preferences"], target: "settings" },
  { words: ["whiteboard", "board", "canvas"], target: "whiteboard" },
  { words: ["chat", "channel", "messages", "channels"], target: "chat" },
  { words: ["workspace", "workspaces"], target: "workspace" },
  { words: ["note", "notes", "doc", "docs"], target: "note" },
];

const LAYOUT_WORDS: { words: string[]; name: LayoutName }[] = [
  { words: ["focus"], name: "focus" },
  { words: ["planning", "plan"], name: "planning" },
  { words: ["comms", "communication"], name: "comms" },
  { words: ["review"], name: "review" },
  { words: ["everything", "all apps"], name: "everything" },
];

/** Splits "tasks and calendar and my roadmap" into its parts. */
function segments(text: string): string[] {
  return text
    .split(/\s+(?:and|then|plus|also)\s+|,\s*/)
    .map((part) => part.trim())
    .filter(Boolean);
}

export function parseLocally(input: string): { say: string; actions: AgentAction[] } {
  const text = normalize(input);
  if (!text) return { say: "", actions: [{ type: "none" }] };

  if (/\b(minimi[sz]e|hide|clear|show desktop)\b/.test(text) && /\b(all|everything|desktop)\b/.test(text)) {
    return { say: "Clearing your desktop.", actions: [{ type: "minimize_all" }] };
  }

  if (/\bclose\b/.test(text)) {
    if (/\b(all|everything)\b/.test(text)) {
      return { say: "Closing everything.", actions: [{ type: "close", all: true }] };
    }
    const what = text.replace(/.*\bclose\b\s*/, "").trim();
    return { say: "Closing that.", actions: [{ type: "close", query: what || undefined }] };
  }

  if (/\b(dark mode|dark theme|go dark)\b/.test(text)) {
    return { say: "Dark mode on.", actions: [{ type: "theme", mode: "dark" }] };
  }
  if (/\b(light mode|light theme)\b/.test(text)) {
    return { say: "Light mode on.", actions: [{ type: "theme", mode: "light" }] };
  }

  for (const layout of LAYOUT_WORDS) {
    if (layout.words.some((word) => text.includes(word)) && /\b(layout|mode|setup|arrange)\b/.test(text)) {
      return { say: `${layout.name} layout.`, actions: [{ type: "layout", name: layout.name }] };
    }
  }

  if (/\b(tile|arrange|grid)\b/.test(text)) {
    const mode = text.includes("cascade") ? "cascade" : text.includes("side") ? "left_right" : "grid";
    return { say: "Arranging your windows.", actions: [{ type: "arrange", mode: mode as never }] };
  }

  if (/\b(open|show|bring up|launch|pull up)\b/.test(text)) {
    const actions: AgentAction[] = [];

    for (const segment of segments(text.replace(/.*?\b(open|show|bring up|launch|pull up)\b\s*/, ""))) {
      const matched = TARGET_WORDS.find((entry) => entry.words.some((word) => segment.split(" ").includes(word)));
      if (!matched) continue;

      // Whatever is left after removing the kind word is the name — "my
      // roadmap note" leaves "roadmap", which is the identifying part.
      const query = segment
        .split(" ")
        .filter((word) => !matched.words.includes(word) && !["my", "the", "a", "our"].includes(word))
        .join(" ")
        .trim();

      actions.push({ type: "open", target: matched.target, query: query || undefined });
    }

    if (actions.length > 0) {
      return { say: "Opening that for you.", actions };
    }
  }

  return {
    say: "I am offline right now, so I can only handle simple commands like open tasks.",
    actions: [{ type: "none" }],
  };
}
