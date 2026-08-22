"use client";

/**
 * Speaks a line back, through /api/voice/speak (ElevenLabs) rather than the
 * browser's built-in speechSynthesis — see that route for why: a real model
 * rendered server-side sounds calm and consistent, where the OS-installed
 * system voice speechSynthesis falls back to is flat and varies machine to
 * machine.
 *
 * Falls back to speechSynthesis only when the request itself fails (offline,
 * key not configured) — a broken reply should degrade to a worse voice, not
 * to silence.
 */

let currentAudio: HTMLAudioElement | null = null;
// Guards against two speak() calls racing: the fetch for the first can still
// resolve after the second has already started playing, and finishing late
// would cut the newer line off mid-sentence.
let currentToken = 0;

function speakWithBrowserVoice(text: string) {
  if (typeof window === "undefined" || !window.speechSynthesis || !text) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 1.05;
  utterance.pitch = 1;
  window.speechSynthesis.speak(utterance);
}

/**
 * @param language The language Whisper detected the user's own command was
 *   spoken in (a name like "English" or "Hindi", straight from
 *   transcribe/route.ts), when known — lets the reply come back in a
 *   matching voice instead of always defaulting to English. Omitted or
 *   unrecognised falls back to the default voice.
 */
export function speak(text: string, language?: string) {
  if (typeof window === "undefined" || !text) return;

  const token = ++currentToken;

  if (currentAudio) {
    currentAudio.pause();
    currentAudio = null;
  }
  window.speechSynthesis?.cancel();

  void fetch("/api/voice/speak", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text, language }),
  })
    .then(async (res) => {
      if (token !== currentToken) return;
      if (!res.ok) throw new Error(`speak failed (${res.status})`);

      const blob = await res.blob();
      if (token !== currentToken) return;

      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      currentAudio = audio;
      audio.addEventListener("ended", () => URL.revokeObjectURL(url), { once: true });
      audio.addEventListener("error", () => URL.revokeObjectURL(url), { once: true });
      await audio.play();
    })
    .catch(() => {
      if (token !== currentToken) return;
      speakWithBrowserVoice(text);
    });
}
