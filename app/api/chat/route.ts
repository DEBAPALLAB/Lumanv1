import { insertChatMessage } from "@/lib/db/chat";
import { delegateIfSecretMissing } from "@/lib/server/delegate";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createOpenAI } from "@ai-sdk/openai";
import { streamText, tool } from "ai";
import { z } from "zod";

export const runtime = "edge";
export const maxDuration = 30;

export async function POST(req: Request) {
  try {
    // The OpenRouter key is billable and stays on the server. On desktop this
    // forwards to the deployed backend, whose response streams back unchanged.
    const delegated = await delegateIfSecretMissing(req, ["OPENROUTER_API_KEY"]);
    if (delegated) return delegated;

    const { messages, noteId, model } = await req.json();

    if (!noteId || !messages) {
      return new Response("Missing required fields", { status: 400 });
    }

    const supabase = await createSupabaseServerClient();

    // Fetch current note context
    const { data: currentNote } = await supabase
      .from("notes")
      .select("title, content, workspace_id, tags")
      .eq("id", noteId)
      .single();

    const openRouter = createOpenAI({
      baseURL: "https://openrouter.ai/api/v1",
      apiKey: process.env.OPENROUTER_API_KEY,
    });

    try {
      const lastMessage = messages[messages.length - 1];
      if (lastMessage.role === "user") {
        await insertChatMessage(noteId, "user", lastMessage.content);
      }
    } catch {
      // Best-effort chat history persistence — do not fail the request if it errors.
    }

    const systemMessage = {
      role: "system" as const,
      content: `You are a helpful AI assistant helping users with their notes.
Current Note Content:
Title: ${currentNote?.title || "Untitled"}
Content: ${JSON.stringify(currentNote?.content || "")}
Tags: ${currentNote?.tags?.join(", ") || "None"}

You have access to the user's entire workspace. You can search for other notes, read their content, and help the user find connections between them.
When a user asks about other notes, use the 'searchNotes' tool.
When you need to read the content of a specific note you found, use 'getNoteContent'.
You can also suggest and apply tags using 'applyTags'.`,
    };

    const selectedModel = model || "stepfun/step-3.5-flash:free";

    const result = await streamText({
      model: openRouter(selectedModel),
      messages: [systemMessage, ...messages],
      tools: {
        scheduleNote: tool({
          description: "Schedule the current note with a due date.",
          parameters: z.object({
            date: z.string().describe("ISO date string or YYYY-MM-DD"),
          }),
          execute: async ({ date }) => {
            const { error } = await supabase.from("notes").update({ due_date: date }).eq("id", noteId);
            return error ? "Failed to schedule note." : `Note scheduled for ${date}`;
          },
        }),
        searchNotes: tool({
          description: "Search for other notes in the user's workspace by title or content.",
          parameters: z.object({
            query: z.string().describe("The search query"),
          }),
          execute: async ({ query }) => {
            if (!currentNote?.workspace_id) return "No workspace context found.";

            const { data, error } = await supabase
              .from("notes")
              .select("id, title, tags")
              .eq("workspace_id", currentNote.workspace_id)
              .neq("id", noteId) // Don't include current note
              .ilike("title", `%${query}%`);

            if (error) return `Error searching notes: ${error.message}`;
            if (!data || data.length === 0) return "No other notes found matching that query.";

            return `Found ${data.length} notes: ${data.map((n) => `- ${n.title} (ID: ${n.id})`).join("\n")}`;
          },
        }),
        getNoteContent: tool({
          description: "Read the full content of a specific note by its ID.",
          parameters: z.object({
            targetNoteId: z.string().describe("The ID of the note to read"),
          }),
          execute: async ({ targetNoteId }) => {
            const { data, error } = await supabase
              .from("notes")
              .select("title, content, tags")
              .eq("id", targetNoteId)
              .single();

            if (error) return `Error fetching note: ${error.message}`;
            return `Note: ${data.title}\nContent: ${JSON.stringify(data.content)}\nTags: ${data.tags?.join(", ")}`;
          },
        }),
        applyTags: tool({
          description: "Apply tags to the current note.",
          parameters: z.object({
            tags: z.array(z.string()).describe("List of tags to apply"),
          }),
          execute: async ({ tags }) => {
            const { error } = await supabase.from("notes").update({ tags }).eq("id", noteId);
            return error ? "Failed to apply tags." : `Applied tags: ${tags.join(", ")}`;
          },
        }),
      },
      onFinish: async ({ text }) => {
        if (text) {
          await insertChatMessage(noteId, "assistant", text);
        }
      },
    });

    return result.toDataStreamResponse();
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: "Internal Server Error",
        details: error instanceof Error ? error.message : String(error),
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}
