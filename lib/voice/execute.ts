"use client";

/**
 * Running an action plan against the desktop.
 *
 * The single place that turns an `AgentAction` into a window. Everything
 * upstream — the model, the offline parser — only ever produces actions, so
 * "what a command does" is defined once, here, rather than in each producer.
 *
 * BATCHING IS THE POINT
 *   Actions arrive as a list, not one at a time, and consecutive `open`s are
 *   deliberately collected before any of them run. Opening three windows one
 *   by one would cascade them 32px apart — three windows, two visible edges.
 *   Collected, they get real tiles and land as an arrangement. That is the
 *   difference between "it opened my stuff" and "it set up my desk".
 */

import {
  type WindowKind,
  closeWindow,
  focusWindow,
  minimizeAll,
  moveWindow,
  openWindow,
  setTheme,
  toggleMaximize,
} from "@/lib/os/window-store";
import { LAYOUTS, cascade, tile } from "./layout";
import { type Candidate, allMatches, bestMatch } from "./resolve";
import type { ActionResult, AgentAction, AgentTarget } from "./types";

/**
 * Everything the executor needs to resolve a name into an openable window.
 *
 * Supplied by the desktop, which already holds all of it — the executor never
 * fetches. A voice command must not wait on a round trip it could have avoided.
 */
export type ExecContext = {
  /** Every addressable thing on the desktop, indexed by the id the model saw. */
  candidates: Candidate[];
  /** Currently open windows, so "close the calendar" can find its target. */
  openWindows: { id: string; kind: string; title: string }[];
  /** Creates a note and returns it, for `create_note`. */
  createNote?: (workspaceId: string, title: string) => Promise<{ id: string; title: string }>;
  /** Deletes a note, for `delete_note`. */
  deleteNote?: (workspaceId: string, noteId: string) => Promise<void>;
  /** Workspace to create in when the speaker did not name one. */
  defaultWorkspaceId?: string | null;
  /** Opens the command palette, for `search`. */
  openSearch?: (query?: string) => void;
  /** next-themes' setter, for `theme`. */
  setTheme?: (mode: "light" | "dark") => void;
};

/** Apps that exist once and take no name. */
const SINGLETONS: Partial<Record<AgentTarget, { kind: WindowKind; title: string; key: string }>> = {
  tasks: { kind: "tasks", title: "My tasks", key: "tasks:mine" },
  calendar: { kind: "calendar", title: "Calendar", key: "calendar:org" },
  files: { kind: "files", title: "Files", key: "files" },
  settings: { kind: "settings", title: "Settings", key: "settings" },
};

/** One resolved thing, ready to be opened. */
type Resolved = { key: string; kind: WindowKind; title: string; payload?: Record<string, unknown> };

/**
 * Turns one `open` action into the windows it means.
 *
 * Returns a list because a single spoken phrase legitimately maps to several
 * windows — "open my design notes" is one action and three windows. An empty
 * list means nothing matched, which the caller reports rather than papering over.
 */
function resolveOpen(action: Extract<AgentAction, { type: "open" }> & { id?: string }, ctx: ExecContext): Resolved[] {
  const singleton = SINGLETONS[action.target];
  if (singleton) {
    return [{ key: singleton.key, kind: singleton.kind, title: singleton.title }];
  }

  // The model picked an id out of the snapshot it was given — the strong path.
  // Verified against the live list rather than trusted, because the desktop
  // may have changed between the snapshot and the answer.
  if (action.id) {
    // Matched three ways because the model does not always echo the id back
    // verbatim. Snapshot ids are prefixed ("note:<uuid>"), and a model asked
    // for "the id" will quite reasonably return the bare uuid, or occasionally
    // re-prefix one that was already prefixed. All three name the same row, so
    // all three resolve rather than silently falling through to a name search.
    const wanted = action.id;
    const bare = wanted.includes(":") ? wanted.slice(wanted.indexOf(":") + 1) : wanted;
    const exact = ctx.candidates.find(
      (c) => c.id === wanted || c.id === `${action.target}:${bare}` || c.id.slice(c.id.indexOf(":") + 1) === bare,
    );
    if (exact) {
      return [{ key: exact.id, kind: exact.target as WindowKind, title: exact.title, payload: exact.payload }];
    }
  }

  if (!action.query) return [];

  // Only consider things of the kind that was asked for, so "open design"
  // cannot answer a note request with a whiteboard.
  const pool = ctx.candidates.filter((c) => c.target === action.target);

  // Plural phrasing means every close match; singular means the best one.
  const plural = /\b(all|every|both)\b|s\b/i.test(action.query.trim().split(/\s+/).pop() ?? "");
  const matches = plural ? allMatches(action.query, pool) : [bestMatch(action.query, pool)].filter(Boolean);

  return (matches as Candidate[]).map((c) => ({
    key: c.id,
    kind: c.target as WindowKind,
    title: c.title,
    payload: c.payload,
  }));
}

/** Opens a batch and tiles it. One window keeps its natural placement. */
function openBatch(items: Resolved[]): void {
  if (items.length === 0) return;

  // A single window opened alone should land where the cascade puts it —
  // full-screen tiling one window is heavy-handed for "open my note".
  if (items.length === 1) {
    const only = items[0];
    openWindow({ kind: only.kind, title: only.title, payload: only.payload, dedupeKey: only.key });
    return;
  }

  const rects = tile(items.length);
  items.forEach((item, index) => {
    const id = openWindow({
      kind: item.kind,
      title: item.title,
      payload: item.payload,
      dedupeKey: item.key,
      rect: rects[index],
    });
    // `openWindow` focuses an already-open window rather than re-placing it,
    // so a window that survived from a previous command is moved into its tile
    // explicitly. Without this, re-running a layout leaves stragglers behind.
    moveWindow(id, rects[index]);
  });

  // The first thing named ends up on top, matching the order it was spoken.
  focusWindow(items[0].key);
}

/** Finds an open window by spoken name, matching its title or its kind. */
function findOpen(query: string, ctx: ExecContext) {
  const byTitle = bestMatch(
    query,
    ctx.openWindows.map((w) => ({ id: w.id, title: w.title, target: w.kind as AgentTarget })),
  );
  if (byTitle) return ctx.openWindows.find((w) => w.id === byTitle.id) ?? null;

  const byKind = bestMatch(
    query,
    ctx.openWindows.map((w) => ({ id: w.id, title: w.kind, target: w.kind as AgentTarget })),
  );
  return byKind ? (ctx.openWindows.find((w) => w.id === byKind.id) ?? null) : null;
}

/** Human-readable list: "Tasks, Calendar and Q3 Roadmap". */
function join(names: string[]): string {
  if (names.length === 0) return "";
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/**
 * Runs a whole plan and reports what happened.
 *
 * Consecutive `open`s are merged into one batch so they tile together; any
 * other action flushes the batch first, preserving the order things were said.
 */
export async function executePlan(actions: AgentAction[], ctx: ExecContext): Promise<ActionResult> {
  const done: string[] = [];
  const missed: string[] = [];
  let pending: Resolved[] = [];

  const flush = () => {
    if (pending.length === 0) return;
    openBatch(pending);
    done.push(...pending.map((item) => item.title));
    pending = [];
  };

  for (const action of actions) {
    if (action.type === "open") {
      const resolved = resolveOpen(action, ctx);
      if (resolved.length === 0) {
        missed.push(action.query ?? action.target);
        continue;
      }
      // Deduped inside the batch so "open tasks and my tasks" tiles two slots
      // for one window and leaves a gap.
      for (const item of resolved) {
        if (!pending.some((existing) => existing.key === item.key)) pending.push(item);
      }
      continue;
    }

    flush();

    switch (action.type) {
      case "layout": {
        const layout = LAYOUTS[action.name];
        if (!layout) {
          missed.push(action.name);
          break;
        }
        const items: Resolved[] = [];
        for (const spec of layout.items) {
          // A layout names kinds, not specific documents, so an unqualified
          // slot takes the most recent thing of that kind — "focus" means the
          // note you are actually working on.
          const target = spec.target as AgentTarget;
          const singleton = SINGLETONS[target];
          if (singleton) {
            items.push({ key: singleton.key, kind: singleton.kind, title: singleton.title });
            continue;
          }
          const first = ctx.candidates.find((c) => c.target === target);
          if (first) {
            items.push({ key: first.id, kind: first.target as WindowKind, title: first.title, payload: first.payload });
          }
        }
        if (items.length === 0) {
          missed.push(`${layout.label} layout`);
          break;
        }
        openBatch(items);
        done.push(`${layout.label} layout`);
        break;
      }

      case "arrange": {
        const open = ctx.openWindows;
        if (open.length === 0) {
          missed.push("anything to arrange");
          break;
        }
        const rects = action.mode === "cascade" ? cascade(open.length) : tile(open.length);
        open.forEach((win, index) => moveWindow(win.id, rects[index]));
        done.push("arranged your windows");
        break;
      }

      case "close": {
        if (action.all) {
          for (const win of ctx.openWindows) closeWindow(win.id);
          done.push("closed everything");
          break;
        }
        const target = action.query ? findOpen(action.query, ctx) : null;
        if (!target) {
          missed.push(action.query ?? "that window");
          break;
        }
        closeWindow(target.id);
        done.push(`closed ${target.title}`);
        break;
      }

      case "minimize_all":
        minimizeAll();
        done.push("cleared your desktop");
        break;

      case "focus": {
        const target = findOpen(action.query, ctx);
        if (!target) {
          missed.push(action.query);
          break;
        }
        focusWindow(target.id);
        done.push(target.title);
        break;
      }

      case "maximize": {
        const target = action.query ? findOpen(action.query, ctx) : ctx.openWindows[0];
        if (!target) {
          missed.push(action.query ?? "that window");
          break;
        }
        toggleMaximize(target.id);
        done.push(`maximized ${target.title}`);
        break;
      }

      case "create_note": {
        if (!ctx.createNote) {
          missed.push("creating notes");
          break;
        }
        // A named workspace wins; otherwise the note lands in the default one,
        // because refusing to create a note over an unspecified workspace
        // would fail a command that has an obvious right answer.
        const named = action.workspace
          ? bestMatch(
              action.workspace,
              ctx.candidates.filter((c) => c.target === "workspace"),
            )
          : null;
        const workspaceId = named?.payload?.workspaceId ?? named?.id ?? ctx.defaultWorkspaceId;
        if (!workspaceId) {
          missed.push("a workspace to put it in");
          break;
        }
        try {
          const note = await ctx.createNote(String(workspaceId), action.title);
          openWindow({
            kind: "note",
            title: note.title || action.title,
            payload: { noteId: note.id, workspaceId: String(workspaceId) },
            dedupeKey: `note:${note.id}`,
          });
          done.push(`created ${note.title || action.title}`);
        } catch {
          missed.push(`creating ${action.title}`);
        }
        break;
      }

      case "delete_note": {
        if (!ctx.deleteNote) {
          missed.push("deleting notes");
          break;
        }
        // Unconfirmed reaches here only if a producer misbehaves — the model
        // is instructed to hold the action back and ask instead, and the
        // fallback parser never emits this action at all. Refusing here too
        // means a bad plan can never delete anything sight unseen.
        if (!action.confirmed) {
          missed.push(`deleting "${action.query}" without confirmation`);
          break;
        }
        const note = bestMatch(
          action.query,
          ctx.candidates.filter((c) => c.target === "note"),
        );
        const workspaceId = note?.payload?.workspaceId;
        if (!note || !workspaceId) {
          missed.push(action.query);
          break;
        }
        try {
          const bareId = note.id.includes(":") ? note.id.slice(note.id.indexOf(":") + 1) : note.id;
          await ctx.deleteNote(String(workspaceId), bareId);
          // A window already open on this note would otherwise keep showing
          // it, or error the next time it tries to save — closing it is part
          // of "deleted", not a separate step the user has to also ask for.
          const openWindow = ctx.openWindows.find((w) => w.id === note.id || w.id.endsWith(bareId));
          if (openWindow) closeWindow(openWindow.id);
          done.push(`deleted ${note.title}`);
        } catch {
          missed.push(`deleting ${note.title}`);
        }
        break;
      }

      case "theme": {
        if (!ctx.setTheme) {
          missed.push("the theme");
          break;
        }
        // Delegated to next-themes rather than toggling the class here: it
        // owns the persisted value and the class on <html>, and writing either
        // one directly would be overwritten the next time it reconciles.
        const dark =
          action.mode === "toggle" ? !document.documentElement.classList.contains("dark") : action.mode === "dark";
        ctx.setTheme(dark ? "dark" : "light");
        done.push(dark ? "switched to dark" : "switched to light");
        break;
      }

      case "search":
        ctx.openSearch?.(action.query);
        done.push("opened search");
        break;

      case "none":
        break;
    }
  }

  flush();

  if (done.length === 0 && missed.length === 0) {
    return { ok: true, message: "" };
  }
  if (done.length === 0) {
    return { ok: false, message: `I could not find ${join(missed)}.` };
  }
  if (missed.length > 0) {
    return { ok: true, message: `Opened ${join(done)}. I could not find ${join(missed)}.` };
  }
  return { ok: true, message: `Opened ${join(done)}.` };
}

/** `open_many` is sugar for consecutive opens; flattened before execution. */
export function flatten(actions: AgentAction[]): AgentAction[] {
  const out: AgentAction[] = [];
  for (const action of actions) {
    if (action.type === "open_many") {
      for (const item of action.items) out.push({ type: "open", target: item.target, query: item.query });
    } else {
      out.push(action);
    }
  }
  return out;
}
