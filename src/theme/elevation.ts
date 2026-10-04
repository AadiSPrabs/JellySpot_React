/**
 * Elevation scale.
 *
 * The codebase had accumulated nine different elevation values - 0, 2, 3, 4,
 * 5, 6, 8, 16 and 9999 - with three near-identical cards each using a
 * different shadow spec. This names the roles instead.
 *
 * Android renders `elevation`; iOS renders the shadow* properties. Both are
 * declared together so a surface looks the same depth on either platform.
 *
 * The shadow values are the Material defaults (offset 2, opacity 0.25,
 * radius 3.84) rather than per-screen guesses, so identical depths match.
 */

export interface ElevationStyle {
  elevation: number;
  shadowColor: string;
  shadowOffset: { width: number; height: number };
  shadowOpacity: number;
  shadowRadius: number;
}

const make = (
  elevation: number,
  shadowOpacity: number,
  shadowRadius: number,
): ElevationStyle => ({
  elevation,
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity,
  shadowRadius,
});

export const ELEVATION = {
  /** Flush. Overlays and full-bleed surfaces that sit on the page. */
  none: make(0, 0, 0),
  /** Inline chips, badges, list rows that lift slightly. */
  low: make(2, 0.15, 2),
  /** Cards and grouped containers. The common case. */
  medium: make(4, 0.25, 3.84),
  /** The mini player, floating actions - anything above scrolling content. */
  high: make(8, 0.3, 5),
  /** Bottom sheets and modals. */
  overlay: make(16, 0.5, 10),
} as const;

export type ElevationToken = keyof typeof ELEVATION;
