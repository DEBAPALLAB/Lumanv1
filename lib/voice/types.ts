/**
 * The vocabulary the voice agent speaks.
 *
 * Both halves of the agent — the on-device parser and the model behind
 * /api/voice/agent — produce values of `AgentAction` and nothing else. The
 * executor (lib/voice/execute.ts) is the only code that turns one into a
 * window. Keeping the intermediate representation explicit rather than
 * letting each half poke the window store directly is what makes the two
 * interchangeable: the parser can answer instantly, the model can answer for
 * anything the parser missed, and neither one needs to know how a window is
 * opened.
 *
 * Every action is addressed by *name*, never by id. The speaker says "open
 * the roadmap note", not a uuid, so resolution from spoken words to a record
 * happens in the executor against the desktop's live index (see resolve.ts).
 */

/** A window kind the agent is allowed to open. */
export type AgentTarget = "note" | "chat" | "tasks" | "calendar" | "workspace" | "whiteboard" | "files" | "settings";

/** Named multi-window arrangements the agent can lay out in one command. */
export type LayoutName = "focus" | "planning" | "comms" | "review" | "everything";

export type AgentAction =
  /**
   * Open one window. `query` is the spoken name — "the roadmap note", "design"
   * — and is matched fuzzily; omitted for singleton apps like Tasks.
   */
  | { type: "open"; target: AgentTarget; query?: string }
  /** Open several windows at once and tile them. The headline capability. */
  | { type: "open_many"; items: { target: AgentTarget; query?: string }[] }
  /** Apply a named arrangement — "focus mode", "planning layout". */
  | { type: "layout"; name: LayoutName }
  /** Tile whatever is already open, without opening anything new. */
  | { type: "arrange"; mode: "grid" | "cascade" | "left_right" }
  /** Close a window by name, or every window when `all` is set. */
  | { type: "close"; query?: string; all?: boolean }
  /** Minimise everything — the "show desktop" gesture. */
  | { type: "minimize_all" }
  /** Bring a named window to the front. */
  | { type: "focus"; query: string }
  /** Maximise a named window, or the focused one when `query` is omitted. */
  | { type: "maximize"; query?: string }
  /** Create a new note, optionally in a named workspace. */
  | { type: "create_note"; title: string; workspace?: string }
  /**
   * Delete a note by name. Destructive, so the executor only ever runs this
   * when `confirmed` is true — set only when the utterance itself already
   * contained a clear confirmation ("yes, delete it", "go ahead and delete
   * the roadmap note"), never on the first ask for a delete.
   */
  | { type: "delete_note"; query: string; confirmed: boolean }
  /** Switch the desktop between light and dark. */
  | { type: "theme"; mode: "light" | "dark" | "toggle" }
  /** Open the command palette, pre-filled when a query is given. */
  | { type: "search"; query?: string }
  /** Nothing actionable was understood. `speak` explains why. */
  | { type: "none"; speak?: string };

/** What the executor reports back, so the agent can say it and show it. */
export type ActionResult = {
  ok: boolean;
  /** One short line, spoken aloud and shown in the transcript. */
  message: string;
};

/** A turn in the conversation, rendered in the agent panel. */
export type Turn = {
  id: string;
  role: "user" | "agent";
  text: string;
  /** Set on agent turns that failed, so the panel can mark them. */
  failed?: boolean;
  at: number;
};
