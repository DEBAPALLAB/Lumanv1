import { apiError } from "@/lib/api-response";
import { requireUser } from "@/lib/auth/session";
import { delegateIfSecretMissing } from "@/lib/server/delegate";

/**
 * Audio in, text out — for browsers that cannot run the built-in
 * SpeechRecognition API.
 *
 * WHY THIS EXISTS ALONGSIDE use-speech.ts
 *   Chrome's `webkitSpeechRecognition` is not a web standard — it is a
 *   Google-private integration that only works when the browser ships
 *   Google's speech backend wired in. Confirmed directly against a user's
 *   machine: it failed identically in both Chrome (a broken/missing internal
 *   speech component — `chrome://voicesearch` came back blank) and Comet
 *   (Perplexity's browser, which does not carry that integration at all),
 *   while Edge — Microsoft's own build with Microsoft's own speech backend —
 *   worked immediately with no code changes. No amount of client-side
 *   handling fixes that; the browser refuses to even attempt the network
 *   call. The only way to support "any browser" is to stop depending on a
 *   vendor's private speech backend and do the capture ourselves.
 *
 * `MediaRecorder`, unlike `SpeechRecognition`, is an actual web standard
 * every evergreen browser implements identically. This route is the other
 * half of that: it accepts one recorded clip and returns its transcript.
 *
 * WHY GROQ RATHER THAN OPENAI'S OWN WHISPER ENDPOINT
 *   Groq serves the same Whisper model on their own inference hardware at
 *   roughly a tenth of OpenAI's per-minute rate, and is fast enough that a
 *   several-second command still comes back in a small fraction of a second
 *   — the latency budget a push-to-talk interaction actually has.
 */

export const runtime = "nodejs";

const GROQ_TRANSCRIBE_URL = "https://api.groq.com/openai/v1/audio/transcriptions";

/** Generous but bounded — a voice command is seconds long, not minutes. */
const MAX_UPLOAD_BYTES = 12 * 1024 * 1024;

export async function POST(req: Request): Promise<Response> {
  const delegated = await delegateIfSecretMissing(req, ["GROQ_API_KEY"]);
  if (delegated) return delegated;

  // The clip is a snippet of the user's own voice, so this is authenticated
  // even though the route itself never touches the database.
  const user = await requireUser();
  if (!user) return apiError("Not authenticated", 401);

  if (!process.env.GROQ_API_KEY) {
    return apiError("Voice transcription is not configured — GROQ_API_KEY is missing.", 400);
  }

  const contentLength = Number(req.headers.get("content-length") ?? 0);
  if (contentLength > MAX_UPLOAD_BYTES) {
    return apiError("Recording is too long.", 413);
  }

  let audio: Blob;
  try {
    const form = await req.formData();
    const file = form.get("audio");
    if (!(file instanceof Blob) || file.size === 0) {
      return apiError("No audio was received.", 400);
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      return apiError("Recording is too long.", 413);
    }
    audio = file;
  } catch {
    return apiError("Invalid upload — expected multipart form data with an 'audio' field.", 400);
  }

  // Re-packaged rather than forwarded byte-for-byte: the browser names the
  // blob arbitrarily (or not at all), and Groq's endpoint infers the codec
  // from the filename extension, so a recognisable name is what actually
  // makes the upload decodable server-side.
  const upstreamForm = new FormData();
  upstreamForm.append("file", audio, "clip.webm");
  upstreamForm.append("model", "whisper-large-v3-turbo");
  // verbose_json rather than json: it adds a detected language alongside the
  // text (a full name, e.g. "English", "Hindi" — not an ISO code), which the
  // reply-voice route maps to a matching voice rather than always defaulting
  // to English.
  upstreamForm.append("response_format", "verbose_json");
  // Locale is not asked for up front the way SpeechRecognition needs it —
  // Whisper detects the spoken language itself, which is one fewer thing
  // that can silently misconfigure and produce nothing.

  try {
    const upstream = await fetch(GROQ_TRANSCRIBE_URL, {
      method: "POST",
      headers: { authorization: `Bearer ${process.env.GROQ_API_KEY}` },
      body: upstreamForm,
    });

    if (!upstream.ok) {
      const detail = await upstream.text().catch(() => "");
      return apiError(`Transcription failed (${upstream.status}): ${detail.slice(0, 300)}`, 502);
    }

    const body = (await upstream.json()) as { text?: string; language?: string };
    return Response.json({ text: (body.text ?? "").trim(), language: body.language ?? "" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Transcription request failed";
    return apiError(message, 502);
  }
}
