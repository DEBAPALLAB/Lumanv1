import { apiError } from "@/lib/api-response";
import { requireUser } from "@/lib/auth/session";
import { delegateIfSecretMissing } from "@/lib/server/delegate";

/**
 * Text in, speech out — the agent's spoken replies.
 *
 * WHY NOT THE BROWSER'S speechSynthesis
 *   The Web Speech synthesis voices are whatever happens to be installed on
 *   the OS, chosen by the browser with no real control over tone — on most
 *   Windows/Linux setups that means a flat, dated-sounding system voice, and
 *   quality is inconsistent from one machine to the next in exactly the way
 *   MediaRecorder replaced on the input side (see transcribe/route.ts). This
 *   route is that same fix applied to output: a real model renders the audio
 *   server-side once, and every browser just plays the resulting file.
 *
 * ElevenLabs specifically for the voice quality — the model is chosen for how
 * natural and calm it sounds, not for being the cheapest option, since this
 * is the one part of the agent that is heard rather than read.
 */

export const runtime = "nodejs";

const ELEVENLABS_TTS_URL = "https://api.elevenlabs.io/v1/text-to-speech";

// "Sarah" — mature, reassuring, confident. One of ElevenLabs' "premade"
// voices, which (unlike shared/library voices such as "Aria") are reachable
// from the API on a free-tier account. Used whenever no per-language voice is
// configured for the detected language.
const DEFAULT_VOICE_ID = "EXAVITQu4vr4xnSDxMaL";

/** A spoken confirmation is a short sentence, not an essay — bound it hard. */
const MAX_CHARS = 500;

/**
 * Whisper reports the detected language as a full name ("English", "Hindi"),
 * not a code — this is the small set Luman actually ships voices for today.
 * Extend as more ELEVENLABS_VOICE_ID_<CODE> languages are added.
 */
const LANGUAGE_CODES: Record<string, string> = {
  english: "EN",
  hindi: "HI",
  marathi: "MR",
};

/**
 * Picks the voice for the detected language.
 *
 * `language` is whatever Whisper detected the user's own command was spoken
 * in (see transcribe/route.ts) — replying in the same language the person
 * spoke in reads as attentive rather than defaulting every non-English
 * speaker to an English voice. ELEVENLABS_VOICE_ID_<CODE> lets a deployment
 * assign a distinct voice per language; ELEVENLABS_VOICE_ID is the catch-all
 * for every language without its own entry, and the hardcoded default covers
 * a deployment with no voice configuration at all.
 */
function resolveVoiceId(language: string): string {
  const code = LANGUAGE_CODES[language.trim().toLowerCase()];
  if (code) {
    const perLanguage = process.env[`ELEVENLABS_VOICE_ID_${code}`];
    if (perLanguage) return perLanguage;
  }
  return process.env.ELEVENLABS_VOICE_ID || DEFAULT_VOICE_ID;
}

export async function POST(req: Request): Promise<Response> {
  const delegated = await delegateIfSecretMissing(req, ["ELEVENLABS_API_KEY"]);
  if (delegated) return delegated;

  // The text being spoken is drawn from the caller's own desktop and
  // commands, so this follows the same auth requirement as the other voice
  // routes even though it never touches the database.
  const user = await requireUser();
  if (!user) return apiError("Not authenticated", 401);

  if (!process.env.ELEVENLABS_API_KEY) {
    return apiError("Voice replies are not configured — ELEVENLABS_API_KEY is missing.", 400);
  }

  let body: { text?: string; language?: string };
  try {
    body = await req.json();
  } catch {
    return apiError("Invalid JSON body", 400);
  }

  const text = (body.text ?? "").trim();
  if (!text) return apiError("text is required", 400);
  if (text.length > MAX_CHARS) return apiError("text is too long", 400);

  const voiceId = resolveVoiceId(body.language ?? "");

  try {
    const upstream = await fetch(`${ELEVENLABS_TTS_URL}/${voiceId}?output_format=mp3_44100_128`, {
      method: "POST",
      headers: {
        "xi-api-key": process.env.ELEVENLABS_API_KEY,
        "content-type": "application/json",
        accept: "audio/mpeg",
      },
      body: JSON.stringify({
        text,
        model_id: "eleven_turbo_v2_5",
        voice_settings: {
          // Tuned toward calm and consistent rather than expressive — a
          // desktop assistant reading back a confirmation should sound
          // steady, not performative.
          stability: 0.6,
          similarity_boost: 0.8,
          style: 0.15,
          use_speaker_boost: true,
        },
      }),
    });

    if (!upstream.ok) {
      const detail = await upstream.text().catch(() => "");
      return apiError(`Speech synthesis failed (${upstream.status}): ${detail.slice(0, 300)}`, 502);
    }

    return new Response(upstream.body, {
      status: 200,
      headers: { "content-type": "audio/mpeg", "cache-control": "no-store" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Speech synthesis request failed";
    return apiError(message, 502);
  }
}
