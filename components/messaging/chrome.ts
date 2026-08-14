/**
 * Shared surface tokens for the chat surface.
 *
 * Every messaging component used to hand-roll its own border/shadow strings,
 * which is why the panels drifted apart: three different border widths and two
 * shadow offsets across seven files. Centralising them means the hierarchy is
 * a deliberate choice rather than whatever each file happened to inherit.
 *
 * The hierarchy, loudest to quietest:
 *   FRAME   structural edges between panels — the app's spine
 *   RAISED  things that sit above the surface and can be clicked
 *   INSET   quiet dividers inside a panel
 *
 * Brutalism reads as noise when everything shouts at 3px. The rail and the
 * transcript are separated by FRAME; a day divider inside the transcript is
 * INSET. That contrast is what makes the heavy edges mean something.
 */

/** Structural edge between two panels. */
export const FRAME = "border-black dark:border-stone-100";

/** Hard offset shadow, sized to the element's weight. */
export const SHADOW_SM =
  "shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] dark:shadow-[2px_2px_0px_0px_rgba(255,255,255,1)]";
export const SHADOW_MD =
  "shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] dark:shadow-[3px_3px_0px_0px_rgba(255,255,255,1)]";

/** The press affordance: the shadow collapses and the element moves into it. */
export const PRESSABLE =
  "transition-[transform,box-shadow] duration-150 hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px] active:translate-x-[3px] active:translate-y-[3px]";

/** Keyboard focus. The app had no visible ring anywhere in chat. */
export const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#FBBF24] focus-visible:ring-offset-white dark:focus-visible:ring-offset-zinc-950";

/** Panel backgrounds. Warm paper in light, true-neutral charcoal in dark. */
export const SURFACE = "bg-[#FDFBF7] dark:bg-zinc-950";
export const PANEL = "bg-white dark:bg-zinc-900";

/** The one accent. Amber earns its weight by being the only saturated colour. */
export const ACCENT = "#FBBF24";

/**
 * Deterministic avatar tint, so a person keeps the same colour everywhere.
 * Saturation is kept under 80% so the avatars sit behind the amber accent
 * rather than competing with it.
 */
const AVATAR_TINTS = [
  "bg-[#E8B4B8]",
  "bg-[#8FB8AC]",
  "bg-[#C3A6D8]",
  "bg-[#E0A458]",
  "bg-[#7FA5C4]",
  "bg-[#B8C48F]",
  "bg-[#D89A9A]",
  "bg-[#96B3D9]",
];

export function tintFor(id: string | null) {
  if (!id) return AVATAR_TINTS[0];
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return AVATAR_TINTS[hash % AVATAR_TINTS.length];
}

/**
 * Initials from a display name: two letters where the name has two words, one
 * otherwise. A single glyph in a 28px square reads as an accident; two reads
 * as a monogram.
 */
export function initialsFor(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}
