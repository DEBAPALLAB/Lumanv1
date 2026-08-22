/**
 * Matching spoken words to things on the desktop.
 *
 * Speech recognition does not return the string you'd type. It returns "the
 * road map note", "q three planning", "design's" — homophones, inserted
 * spaces, possessives and filler words wrapped around the one word that
 * actually identifies the thing. An exact `includes` test fails on all of
 * these, which is the difference between an agent that works and a demo.
 *
 * So matching is scored rather than boolean, over a normalised form of both
 * sides, and the best-scoring candidate wins provided it clears a floor. A
 * near-miss returning nothing is correct: opening the wrong note because it
 * shared a letter is worse than admitting the miss and asking again.
 */

import type { AgentTarget } from "./types";

/** Words that carry no identity — stripped before scoring so they can't dilute it. */
const STOPWORDS = new Set([
  "the",
  "a",
  "an",
  "my",
  "our",
  "please",
  "open",
  "up",
  "for",
  "me",
  "note",
  "notes",
  "doc",
  "document",
  "file",
  "window",
  "workspace",
  "channel",
  "board",
  "whiteboard",
  "and",
  "then",
  "also",
  "to",
  "of",
  "in",
  "on",
  "s",
]);

/**
 * Numbers, as spoken versus as written.
 *
 * A recognizer transcribes "Q3" as "q three" about as often as "q3", and the
 * note is titled with the digit. Without this the two never meet.
 */
const SPOKEN_NUMBERS: Record<string, string> = {
  zero: "0",
  one: "1",
  two: "2",
  three: "3",
  four: "4",
  five: "5",
  six: "6",
  seven: "7",
  eight: "8",
  nine: "9",
  ten: "10",
};

/**
 * Lowercase, strip punctuation and possessives, collapse whitespace.
 * "Q3 Planning's" and "q3 plannings" must reduce to the same thing, or the
 * apostrophe the recognizer invented costs you the match.
 */
export function normalize(input: string): string {
  return input
    .toLowerCase()
    .replace(/['’]s\b/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .map((word) => SPOKEN_NUMBERS[word] ?? word)
    .join(" ");
}

/**
 * The same string with every space removed.
 *
 * Recognizers split compound words unpredictably — "roadmap" comes back as
 * "road map", "whiteboard" as "white board" — and which one you get varies
 * between utterances of the same word. Comparing the squashed forms makes the
 * split invisible, which is the single highest-value normalisation here
 * because compound nouns are exactly what documents get named after.
 */
function squash(input: string): string {
  return normalize(input).replace(/\s/g, "");
}

/** Significant words only — the ones that actually name the thing. */
function tokens(input: string): string[] {
  return normalize(input)
    .split(" ")
    .filter((word) => word.length > 0 && !STOPWORDS.has(word));
}

/**
 * How well `query` names `candidate`, from 0 (unrelated) to 1 (exact).
 *
 * Layered deliberately, strongest signal first: an exact match beats a
 * substring, which beats overlapping words, which beats a prefix. The tiers
 * are spread far enough apart that a genuine substring hit always outranks
 * incidental word overlap, so "roadmap" prefers "Roadmap" over "Q3 Planning
 * Roadmap Review" only when nothing stronger exists.
 */
export function score(query: string, candidate: string): number {
  const q = normalize(query);
  const c = normalize(candidate);
  if (!q || !c) return 0;

  if (q === c) return 1;

  // Compared space-blind, so "road map" and "Roadmap" are the same word. Ranked
  // just under an exact match and above a substring hit: two strings that are
  // identical once spacing is ignored are the same name in practice.
  const qs = squash(q);
  const cs = squash(c);
  if (qs === cs) return 0.97;

  // Whole spoken phrase appears in the name — very strong, and scaled by how
  // much of the name it covers so a short query does not fully claim a long
  // title. Floored at three characters for the same reason as the squashed
  // test below: a one-letter fragment is inside half the library.
  if (q.length >= 3) {
    if (c.includes(q)) return 0.75 + 0.2 * (q.length / c.length);
    if (q.includes(c)) return 0.7 + 0.2 * (c.length / q.length);
  }

  // The same containment test, space-blind. Catches "q three road map" against
  // "Q3 Roadmap", where neither the spacing nor the numeral survived the mic.
  //
  // Floored at three characters: without it every one- or two-letter fragment
  // the recognizer coughs up is a substring of something, and a stray "x"
  // would confidently open whichever note happens to contain an x.
  if (qs.length >= 3) {
    if (cs.includes(qs)) return 0.7 + 0.2 * (qs.length / cs.length);
    if (qs.includes(cs)) return 0.65 + 0.2 * (cs.length / qs.length);
  }

  const qt = tokens(q);
  const ct = tokens(c);
  if (qt.length === 0 || ct.length === 0) return 0;

  let hits = 0;
  for (const word of qt) {
    // A word counts when it appears whole, as a prefix of at least four
    // characters — "plan" should reach "planning", but "p" should reach
    // nothing — or as a chunk of a candidate word it was split out of, which
    // is what makes the "map" in "road map" count towards "Roadmap".
    if (
      ct.some(
        (other) =>
          other === word ||
          (word.length >= 4 && other.startsWith(word)) ||
          (other.length >= 4 && word.startsWith(other)) ||
          (word.length >= 3 && other.includes(word)),
      )
    ) {
      hits++;
    }
  }
  if (hits === 0) return 0;

  // Scaled by both sides: matching 2 of 2 spoken words against a 2-word title
  // is a better match than 2 of 2 against an 8-word title.
  const coverage = hits / qt.length;
  const density = hits / ct.length;
  return 0.35 * coverage + 0.3 * density;
}

/** Below this, we treat it as "I didn't catch which one" rather than guessing. */
export const MATCH_FLOOR = 0.34;

export type Candidate = {
  id: string;
  title: string;
  target: AgentTarget;
  payload?: Record<string, unknown>;
  /** Shown when disambiguating — the workspace a note lives in, say. */
  hint?: string;
};

/** The best match for a spoken phrase, or null when nothing clears the floor. */
export function bestMatch(query: string, candidates: Candidate[]): Candidate | null {
  let best: Candidate | null = null;
  let bestScore = 0;

  for (const candidate of candidates) {
    const s = score(query, candidate.title);
    if (s > bestScore) {
      bestScore = s;
      best = candidate;
    }
  }

  return bestScore >= MATCH_FLOOR ? best : null;
}

/**
 * Every match clearing the floor, best first.
 *
 * Used for "open my design notes" — plural phrasing where opening all the
 * close matches is the right reading, not picking one and discarding the rest.
 */
export function allMatches(query: string, candidates: Candidate[], limit = 6): Candidate[] {
  return candidates
    .map((candidate) => ({ candidate, s: score(query, candidate.title) }))
    .filter((entry) => entry.s >= MATCH_FLOOR)
    .sort((a, b) => b.s - a.s)
    .slice(0, limit)
    .map((entry) => entry.candidate);
}
