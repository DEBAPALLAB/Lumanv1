"use client";

/**
 * The agent loop: heard → understood → done.
 *
 * Owns the conversation and the one round trip in the middle of it. The model
 * at /api/voice/agent is the primary and intended path — it receives a live
 * snapshot of the desktop with every utterance, which is what lets it resolve
 * "my roadmap note" to an actual id instead of echoing the words back. The
 * local parser is reached only when that request cannot complete.
 *
 * Requests are superseded rather than queued: saying something new while the
 * previous command is still in flight means the new one is what you want, and
 * the stale reply must not open windows behind it.
 */

import { useCallback, useRef, useState } from "react";
import { type ExecContext, executePlan, flatten } from "./execute";
import { parseLocally } from "./fallback-parser";
import { speak } from "./speak";
import type { AgentAction, Turn } from "./types";

/** The wire shape from the route, before nulls are normalised away. */
type WireAction = {
  type: string;
  target?: string | null;
  id?: string | null;
  query?: string | null;
  layout?: string | null;
  mode?: string | null;
  title?: string | null;
  workspace?: string | null;
  all?: boolean | null;
  confirmed?: boolean | null;
};

/**
 * Maps one wire action onto the union the executor consumes.
 *
 * The schema sends every field on every action with nulls for the inapplicable
 * ones, so this drops the nulls and rejects anything malformed. Returns null
 * for an action that cannot be honoured — a bad entry is skipped rather than
 * failing the whole plan, since the other actions in it are still valid.
 */
function toAction(wire: WireAction): (AgentAction & { id?: string }) | null {
  const query = wire.query ?? undefined;

  switch (wire.type) {
    case "open":
      if (!wire.target) return null;
      return { type: "open", target: wire.target as never, query, id: wire.id ?? undefined };
    case "layout":
      if (!wire.layout) return null;
      return { type: "layout", name: wire.layout as never };
    case "arrange":
      return { type: "arrange", mode: (wire.mode ?? "grid") as never };
    case "close":
      return { type: "close", query, all: wire.all ?? undefined };
    case "minimize_all":
      return { type: "minimize_all" };
    case "focus":
      if (!query) return null;
      return { type: "focus", query };
    case "maximize":
      return { type: "maximize", query };
    case "create_note":
      if (!wire.title) return null;
      return { type: "create_note", title: wire.title, workspace: wire.workspace ?? undefined };
    case "delete_note":
      if (!query) return null;
      return { type: "delete_note", query, confirmed: wire.confirmed ?? false };
    case "theme":
      return { type: "theme", mode: (wire.mode ?? "toggle") as never };
    case "search":
      return { type: "search", query };
    case "none":
      return { type: "none" };
    default:
      return null;
  }
}

export type AgentState = {
  turns: Turn[];
  /** True from the moment an utterance is sent until its windows are open. */
  thinking: boolean;
  /** Feed one utterance through the agent. `language` (ISO 639-1, from
   *  transcription) picks which voice the reply is spoken in. */
  submit: (text: string, language?: string) => Promise<void>;
  clear: () => void;
};

let turnCounter = 0;
const nextId = () => `turn-${++turnCounter}`;

export function useAgent({
  context,
  muted = false,
}: {
  /** Rebuilt by the caller on every desktop change, so the snapshot is live. */
  context: () => ExecContext & { snapshot: Record<string, { id: string; title: string; hint?: string }[]> };
  /** When true, results are shown but not spoken. */
  muted?: boolean;
}): AgentState {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [thinking, setThinking] = useState(false);
  // Incremented per submission; a reply whose token is stale is discarded.
  const requestToken = useRef(0);
  const turnsRef = useRef<Turn[]>([]);
  turnsRef.current = turns;

  const append = useCallback((turn: Omit<Turn, "id" | "at">) => {
    setTurns((prev) => [...prev.slice(-40), { ...turn, id: nextId(), at: Date.now() }]);
  }, []);

  const submit = useCallback(
    async (text: string, language?: string) => {
      const utterance = text.trim();
      if (!utterance) return;

      const token = ++requestToken.current;
      append({ role: "user", text: utterance });
      setThinking(true);

      const ctx = context();
      // Only the two sides of the exchange, without the ids and internals —
      // enough for "close it" to resolve, cheap enough to send every time.
      const history = turnsRef.current.slice(-4).map((turn) => ({ role: turn.role, text: turn.text }));

      let say = "";
      let actions: (AgentAction & { id?: string })[] = [];
      let offline = false;
      // The reason the model could not be reached, when the server gave one.
      // Distinguishing "no key configured" from "no network" matters: the
      // first is a five-second fix and the second is not, and a single
      // "I am offline" hides which one you are looking at.
      let degradedReason = "";

      try {
        const res = await fetch("/api/voice/agent", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ transcript: utterance, snapshot: ctx.snapshot, history }),
        });

        if (!res.ok) {
          // The route answers with `{ error }` (lib/api-response.ts). A 400 is
          // a configuration problem worth repeating verbatim to the user.
          const detail = await res
            .json()
            .then((b: { error?: string }) => b?.error ?? "")
            .catch(() => "");
          throw new Error(detail || `Request failed (${res.status})`);
        }

        const body = (await res.json()) as { say?: string; actions?: WireAction[] };
        say = body.say ?? "";
        actions = (body.actions ?? []).map(toAction).filter((a): a is AgentAction & { id?: string } => a !== null);
      } catch (error) {
        // The model is unreachable. Fall through to whatever the local parser
        // can manage rather than dropping the command entirely.
        offline = true;
        degradedReason = error instanceof Error ? error.message : "";
        const local = parseLocally(utterance);
        say = local.say;
        actions = local.actions;
      }

      // A newer utterance arrived while this was in flight — that one is the
      // live command now, and running this plan would fight it.
      if (token !== requestToken.current) return;

      let spoken = say;
      let failed = false;

      if (actions.length > 0 && actions.some((action) => action.type !== "none")) {
        const result = await executePlan(flatten(actions), ctx);
        if (token !== requestToken.current) return;

        // The model's line is the natural one, so it is kept when the plan ran
        // cleanly. The executor's message only wins when something was missed,
        // because that is the part the model could not have known about.
        if (!result.ok || result.message.includes("could not find")) {
          spoken = result.message || say;
          failed = !result.ok;
        }
      }

      if (!spoken) spoken = offline ? "I am offline." : "Done.";

      // Shown but not spoken: the reason is a setup detail for whoever is
      // running the app, and reading an env var name aloud helps nobody.
      const detail = offline && degradedReason ? `${spoken} (${degradedReason})` : spoken;

      append({ role: "agent", text: detail, failed: failed || offline });
      if (!muted) speak(spoken, language);
      setThinking(false);
    },
    [append, context, muted],
  );

  const clear = useCallback(() => setTurns([]), []);

  return { turns, thinking, submit, clear };
}
