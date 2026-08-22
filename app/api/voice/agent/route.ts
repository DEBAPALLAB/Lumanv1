import { apiError } from "@/lib/api-response";
import { requireUser } from "@/lib/auth/session";
import { delegateIfSecretMissing } from "@/lib/server/delegate";
import OpenAI from "openai";

/**
 * The voice agent's brain.
 *
 * Turns one spoken utterance into a list of actions the desktop executes. The
 * model does the understanding; this route's job is to give it enough context
 * to be *specific* and to guarantee the shape of what comes back.
 *
 * WHY THE DESKTOP SNAPSHOT IS IN THE PROMPT
 *   "Open my roadmap note" is unanswerable without knowing the note is called
 *   "Q3 Roadmap" and lives in the Design workspace. A model reasoning in the
 *   abstract can only echo back the words it heard, which pushes the actual
 *   matching onto a string comparison on the client — and then the model was
 *   never doing the understanding at all. So the caller sends what is on the
 *   desktop right now (titles and ids only, never note bodies), and the model
 *   answers with the id it picked. Homophones, partial names, "the one about
 *   pricing", plurals, ordinals — all of it resolves here, against real names,
 *   in a single hop.
 *
 * WHY STRUCTURED OUTPUT RATHER THAN PROSE
 *   The response drives a window manager, so an unparseable reply is a failed
 *   command. `response_format: json_schema` with `strict` makes the shape a
 *   guarantee from the decoder rather than a hope about the prompt — the model
 *   cannot emit an action that does not typecheck.
 *
 * The OpenAI key is billable and server-side only; on desktop builds this
 * route delegates to the deployed backend exactly like /api/generate does.
 */

export const runtime = "nodejs";

/** Ids the model may name. Mirrors AgentTarget in lib/voice/types.ts. */
const TARGETS = ["note", "chat", "tasks", "calendar", "workspace", "whiteboard", "files", "settings"] as const;
const LAYOUTS = ["focus", "planning", "comms", "review", "everything"] as const;

/**
 * The action schema, as the decoder enforces it.
 *
 * One flat object per action with every field always present — OpenAI's strict
 * mode requires each property to appear in `required`, so optional fields are
 * expressed as nullable rather than absent. The client normalises the nulls
 * away when it maps these onto AgentAction.
 */
const ACTION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["say", "actions"],
  properties: {
    say: {
      type: "string",
      // Spelled out as never-empty because the decoder will happily satisfy a
      // bare "string" with "" — and an empty line means the panel shows a blank
      // reply and the agent says nothing back, which reads as a crash.
      description:
        "REQUIRED, never empty. One short spoken sentence confirming what you did, in the second person. Under 12 words. No markdown. Write one even when actions are present.",
      minLength: 1,
    },
    actions: {
      type: "array",
      description: "The actions to run, in order. Empty when nothing was asked for.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["type", "target", "id", "query", "layout", "mode", "title", "workspace", "all", "confirmed"],
        properties: {
          type: {
            type: "string",
            enum: [
              "open",
              "layout",
              "arrange",
              "close",
              "minimize_all",
              "focus",
              "maximize",
              "create_note",
              "delete_note",
              "theme",
              "search",
              "none",
            ],
          },
          target: { type: ["string", "null"], enum: [...TARGETS, null] },
          /** The exact id from the snapshot. Always preferred over `query`. */
          id: { type: ["string", "null"] },
          /** Spoken name, used only when no snapshot id matches. */
          query: { type: ["string", "null"] },
          layout: { type: ["string", "null"], enum: [...LAYOUTS, null] },
          /** arrange: grid|cascade|left_right. theme: light|dark|toggle. */
          mode: { type: ["string", "null"] },
          title: { type: ["string", "null"] },
          workspace: { type: ["string", "null"] },
          all: { type: ["boolean", "null"] },
          /** delete_note only: true when THIS utterance already confirmed it. */
          confirmed: { type: ["boolean", "null"] },
        },
      },
    },
  },
} as const;

const SYSTEM = `You control Luman, a desktop OS where documents open as windows. You receive one thing the user said out loud and turn it into actions.

You are given a live snapshot of their desktop: their workspaces, note titles, channels, whiteboards, and which windows are already open. Every id in it is real.

RULES
1. Resolve names against the snapshot and return the matching "id". Only use "query" when nothing in the snapshot plausibly matches.
2. The input is speech-to-text, so it is often misheard. "road map" means "Roadmap", "q three" means "Q3", "designs" may mean "Design". Match on meaning and sound, not exact characters.
3. Opening several things is several "open" actions in one response. "Open tasks and my calendar" is two actions. Emit them in the order spoken; the desktop tiles them automatically.
4. Plural or vague references may match several items: "open my design notes" opens every design note in the snapshot.
5. tasks, calendar, files and settings are single apps — set target only, no id.
6. Use "layout" for named arrangements: focus, planning, comms, review, everything.
7. If the user is only chatting or asking a question, return one action of type "none" and answer them in "say".
8. Never invent an id that is not in the snapshot.
9. To close or affect everything at once, emit ONE action with "all": true. Never enumerate the snapshot to do it — "close everything" is a single close action with all set, not one close per item.
10. "close", "focus" and "maximize" act on windows that are already OPEN. Address them by "query" using the window's name; the ids in the snapshot are documents, not open windows, so do not put a snapshot id on these.
11. Reply in "say" in the SAME language the user's transcript is written in — a Hindi or Marathi command gets a Hindi or Marathi "say", not an English one. The transcript's own language is the only signal for this; do not guess from names or context.
12. Deleting a note is permanent. Use "delete_note" with "confirmed": true ONLY when the user's OWN words already contain a clear confirmation — e.g. "yes, delete it", "go ahead and delete the roadmap note", "I'm sure, remove it". If they only asked to delete something ("delete my roadmap note", "get rid of the pricing doc") without that confirmation already in the sentence, do NOT emit a delete_note action at all — instead return "actions": [] and use "say" to name the note you believe they mean and ask them to confirm ("Delete Q3 Roadmap? Say yes to confirm."). Never guess "confirmed": true from tone or urgency alone — only from an explicit yes/confirm/go-ahead word in this utterance.

"say" is REQUIRED and is never empty — it is spoken aloud, so write it for every response, including ones with actions. Keep it short, natural and specific: "Opening Q3 Roadmap and your tasks." Not "I have opened the requested windows."`;

/** Caps the snapshot so a large org cannot blow the context window. */
const MAX_PER_KIND = 60;

/**
 * Which provider this deployment talks to.
 *
 * OpenRouter first, because it is this project's required key (the chat route
 * already runs on it) while OPENAI_API_KEY is documented as optional — so the
 * agent works out of the box on an environment that was set up for Luman,
 * rather than demanding a second billable account for one feature.
 *
 * Both are OpenAI-compatible, so the only difference is the base URL, the key,
 * and the model id. Returns null when neither is configured, which the caller
 * reports as a configuration error rather than a failure.
 */
function resolveProvider(): { key: string; baseURL?: string; model: string; envKey: string } | null {
  if (process.env.OPENROUTER_API_KEY) {
    return {
      key: process.env.OPENROUTER_API_KEY,
      baseURL: "https://openrouter.ai/api/v1",
      // Structured outputs are the whole contract here, so the model has to be
      // one that supports them rather than whatever is cheapest.
      model: process.env.VOICE_AGENT_MODEL ?? "openai/gpt-4o-mini",
      envKey: "OPENROUTER_API_KEY",
    };
  }
  if (process.env.OPENAI_API_KEY) {
    return {
      key: process.env.OPENAI_API_KEY,
      model: process.env.VOICE_AGENT_MODEL ?? "gpt-4o-mini",
      envKey: "OPENAI_API_KEY",
    };
  }
  return null;
}

export async function POST(req: Request): Promise<Response> {
  // Delegation is keyed on the provider this machine would actually use. A
  // desktop build has neither key, so `resolveProvider` returns null there and
  // the request forwards to the deployed backend on the required key.
  const provider = resolveProvider();
  const delegated = await delegateIfSecretMissing(req, [provider?.envKey ?? "OPENROUTER_API_KEY"]);
  if (delegated) return delegated;

  // The snapshot describes one user's private workspace, so this route is
  // authenticated even though it never touches the database itself.
  const user = await requireUser();
  if (!user) return apiError("Not authenticated", 401);

  if (!provider) {
    return apiError("Voice agent is not configured — set OPENROUTER_API_KEY or OPENAI_API_KEY.", 400);
  }

  let body: {
    transcript?: string;
    snapshot?: Record<string, { id: string; title: string; hint?: string }[]>;
    history?: { role: "user" | "agent"; text: string }[];
  };

  try {
    body = await req.json();
  } catch {
    return apiError("Invalid JSON body", 400);
  }

  const transcript = (body.transcript ?? "").trim();
  if (!transcript) return apiError("transcript is required", 400);
  if (transcript.length > 1000) return apiError("transcript is too long", 400);

  const snapshot = body.snapshot ?? {};
  const lines: string[] = [];
  for (const [kind, entries] of Object.entries(snapshot)) {
    if (!Array.isArray(entries) || entries.length === 0) continue;
    lines.push(`${kind.toUpperCase()}:`);
    for (const entry of entries.slice(0, MAX_PER_KIND)) {
      lines.push(`  ${entry.id} — ${entry.title}${entry.hint ? ` (${entry.hint})` : ""}`);
    }
  }
  const snapshotText = lines.length > 0 ? lines.join("\n") : "(the desktop is empty)";

  // A couple of turns of history so follow-ups like "close it" or "now the
  // other one" resolve. Bounded hard — this is a command surface, not a chat.
  const history = (body.history ?? []).slice(-6).map((turn) => ({
    role: turn.role === "user" ? ("user" as const) : ("assistant" as const),
    content: String(turn.text ?? "").slice(0, 500),
  }));

  const client = new OpenAI({ apiKey: provider.key, baseURL: provider.baseURL });

  const messages = [
    { role: "system" as const, content: SYSTEM },
    { role: "system" as const, content: `CURRENT DESKTOP\n${snapshotText}` },
    ...history,
    { role: "user" as const, content: transcript },
  ];

  /**
   * One attempt at a plan, or null when the model produced nothing usable.
   *
   * `strict` is worth having — the decoder enforces the shape — but it is not
   * universally reliable through a router that may land the request on any of
   * several upstream providers. Observed failure: the model degenerates into
   * emitting a code fence forever and stops on `length`, leaving a truncated
   * string that cannot parse. So truncation is detected explicitly rather than
   * inferred from a parse error, and the caller retries in a looser mode.
   */
  async function attempt(strict: boolean) {
    const completion = await client.chat.completions.create({
      model: provider!.model,
      // Command interpretation should be repeatable: the same sentence twice
      // must open the same window twice.
      temperature: 0,
      max_tokens: 700,
      response_format: strict
        ? { type: "json_schema", json_schema: { name: "desktop_actions", strict: true, schema: ACTION_SCHEMA } }
        : { type: "json_object" },
      messages: strict
        ? messages
        : // json_object mode enforces only "is JSON", so the shape has to be
          // described in words instead of by the decoder.
          [
            ...messages.slice(0, 2),
            {
              role: "system" as const,
              content: `Reply with ONLY a JSON object of exactly this shape, and nothing else:
{"say":"<one short sentence, never empty>","actions":[{"type":"open|layout|arrange|close|minimize_all|focus|maximize|create_note|delete_note|theme|search|none","target":"note|chat|tasks|calendar|workspace|whiteboard|files|settings|null","id":"<snapshot id or null>","query":"<spoken name or null>","layout":"focus|planning|comms|review|everything|null","mode":null,"title":null,"workspace":null,"all":null,"confirmed":null}]}
No code fences, no commentary. Remember: only set "confirmed":true on delete_note when this utterance itself already contains an explicit yes/confirm word, and write "say" in the same language the transcript is in.`,
            },
            ...messages.slice(2),
          ],
    });

    const choice = completion.choices[0];
    const raw = choice?.message?.content?.trim();
    if (!raw) return null;

    // Ran out of tokens mid-object: whatever came back is a fragment, and
    // parsing it would at best drop actions the user asked for.
    if (choice.finish_reason === "length") return null;

    // A fence survives occasionally even in JSON mode; unwrap before parsing.
    const unfenced = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");

    try {
      const parsed = JSON.parse(unfenced) as { say?: unknown; actions?: unknown };
      if (!Array.isArray(parsed.actions)) return null;
      return JSON.stringify({
        say: typeof parsed.say === "string" ? parsed.say : "",
        actions: parsed.actions,
      });
    } catch {
      return null;
    }
  }

  try {
    const strictResult = await attempt(true);
    // The retry is the whole reason truncation is detected rather than ignored:
    // without it, a degenerate response silently becomes "I am offline" and the
    // user sees the fallback parser instead of the answer they asked for.
    const body = strictResult ?? (await attempt(false));

    if (!body) return apiError("The voice agent could not produce a usable plan.", 502);

    return new Response(body, {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Voice agent request failed";
    return apiError(message, 502);
  }
}
