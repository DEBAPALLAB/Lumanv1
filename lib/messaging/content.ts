/**
 * Message content helpers.
 *
 * A message body is stored as Tiptap document JSON, the same shape
 * notes.content uses. Phase 1's composer only produces paragraphs of text, but
 * the storage shape is the rich one from the start so that adding mentions and
 * note references in Phase 3 needs no data migration.
 *
 * These run on the server (the send route derives content_text before insert)
 * and in the browser (optimistic rendering), so this module stays free of any
 * Node or React import.
 */

export type MessageDoc = {
  type: "doc";
  content?: MessageNode[];
};

export type MessageNode = {
  type: string;
  text?: string;
  attrs?: Record<string, unknown>;
  content?: MessageNode[];
};

/** The largest message we accept, in characters of extracted plain text. */
export const MESSAGE_MAX_LENGTH = 8000;

/** Wraps plain text in the minimal valid document the editor round-trips. */
export function textToDoc(text: string): MessageDoc {
  const paragraphs = text.split(/\n/);

  return {
    type: "doc",
    content: paragraphs.map((line) =>
      // An empty paragraph must have no content array at all — a paragraph
      // holding a zero-length text node is invalid in ProseMirror's schema and
      // throws when the editor tries to parse it back.
      line.length > 0 ? { type: "paragraph", content: [{ type: "text", text: line }] } : { type: "paragraph" },
    ),
  };
}

/**
 * Flattens a document to plain text for previews and (later) notifications.
 *
 * Block-level nodes are joined with newlines and inline nodes run together, so
 * two paragraphs do not collapse into one word. Unknown node types are walked
 * rather than skipped, which keeps this correct when mention and
 * note-reference nodes arrive without needing a change here.
 */
export function docToText(doc: unknown): string {
  if (!doc || typeof doc !== "object") return "";

  const BLOCK_TYPES = new Set([
    "paragraph",
    "heading",
    "blockquote",
    "listItem",
    "codeBlock",
    "bulletList",
    "orderedList",
  ]);

  const walk = (node: MessageNode): string => {
    if (typeof node.text === "string") return node.text;

    // Mentions and note chips carry their visible label in attrs rather than a
    // text child; without this they would vanish from every preview.
    if (node.type === "mention" || node.type === "noteReference") {
      const label = node.attrs?.label;
      if (typeof label === "string") return node.type === "mention" ? `@${label}` : `#${label}`;
    }

    const children = (node.content ?? []).map(walk);
    return BLOCK_TYPES.has(node.type) ? `${children.join("")}\n` : children.join("");
  };

  const root = doc as MessageDoc;
  const text = (root.content ?? []).map(walk).join("");
  return text.replace(/\n{3,}/g, "\n\n").trim();
}

/**
 * Validates a document arriving from a client.
 *
 * Returns the reason it is unacceptable, or null when it is fine. The route
 * turns a reason into a 400 — the point is that a body is checked before it
 * reaches the database, since RLS enforces who may write, not what.
 */
export function validateMessageDoc(doc: unknown): string | null {
  if (!doc || typeof doc !== "object" || Array.isArray(doc)) {
    return "Message content must be an object";
  }

  if ((doc as MessageDoc).type !== "doc") {
    return "Message content must be a document";
  }

  const text = docToText(doc);
  if (text.length === 0) {
    return "Message cannot be empty";
  }

  if (text.length > MESSAGE_MAX_LENGTH) {
    return `Message is too long (${text.length} of ${MESSAGE_MAX_LENGTH} characters)`;
  }

  return null;
}
