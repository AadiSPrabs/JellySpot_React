/**
 * Corner radius scale.
 *
 * The codebase had grown 14 distinct radius values, which is why surfaces that
 * should read as one family did not. This is a small deliberate scale rather
 * than a per-screen choice:
 *
 *  - `xs`   tiny chips and inline tags
 *  - `sm`   artwork thumbnails (list rows, mini player art)
 *  - `md`   cards and grouped containers
 *  - `lg`   sheets and full-width surfaces
 *  - `pill` fully rounded (buttons, handles)
 *
 * These name roles, not sizes, so a screen picks the role it is drawing rather
 * than a number that looked right at the time.
 */
export const RADIUS = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 20,
  pill: 999,
} as const;

export type RadiusToken = keyof typeof RADIUS;
