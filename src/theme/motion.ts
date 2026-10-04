/**
 * Shared motion tokens.
 *
 * Before this existed the queue used `tension`/`friction` springs in one place
 * and `damping`/`stiffness` in another, which is why related transitions never
 * felt like part of the same product. Every spring and duration now comes from
 * here.
 *
 * The easing is ease-out-quart: fast departure, long settle. Bounce and elastic
 * curves are deliberately absent.
 */

import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';
import { Easing } from 'react-native-reanimated';

/** Springs. `SHEET` carries velocity (it is thrown, not clicked). */
export const SPRING = {
  /** Bottom sheet settle. Lower stiffness than ROW so it feels weighty. */
  SHEET: { damping: 30, stiffness: 260, mass: 0.9, overshootClamping: false },
  /** Sheet when driven without release velocity (programmatic open/close). */
  SHEET_SOFT: { damping: 26, stiffness: 220, mass: 1 },
  /** Row lift, drop, and swipe settle - snappier because it is direct touch. */
  ROW: { damping: 24, stiffness: 320, mass: 0.7 },
} as const;

/** Ease-out-quart. Used for anything that is not spring-driven. */
export const EASE_OUT = Easing.bezier(0.25, 1, 0.5, 1);

export const TIMING = {
  /** Instant feedback: press states, haptic-adjacent changes. */
  FAST: 120,
  /** State changes: fades, crossfades. */
  BASE: 200,
  /** Layout changes: entrances, reveals. */
  SLOW: 320,
} as const;

/**
 * Momentum projection factor for sheet release.
 *
 * On release we do not snap from where the finger stopped; we project where the
 * gesture was heading (`y + velocity * PROJECTION`) and snap that. This is what
 * separates a sheet that feels physical from one that feels like a threshold
 * check.
 */
export const SHEET_PROJECTION = 0.15;

/**
 * Tracks the OS "reduce motion" setting, including changes made while the app
 * is running. Consumers use it to collapse springs to instant transitions
 * rather than to disable feedback entirely.
 */
export function useReduceMotion(): boolean {
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    let mounted = true;

    AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => {
        if (mounted) setReduceMotion(enabled);
      })
      .catch(() => {
        // Older platforms may not implement this; keep the default.
      });

    const subscription = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      (enabled: boolean) => {
        if (mounted) setReduceMotion(enabled);
      },
    );

    return () => {
      mounted = false;
      subscription?.remove?.();
    };
  }, []);

  return reduceMotion;
}
