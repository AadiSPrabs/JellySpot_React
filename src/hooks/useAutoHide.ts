import { useCallback, useEffect, useRef, useState } from 'react';

interface UseAutoHideOptions {
  /** Milliseconds of inactivity before hiding. */
  delayMs?: number;
  /** When false the timer is suspended and the UI is forced visible. */
  enabled?: boolean;
}

/**
 * Hides UI after a period of no interaction.
 *
 * Used by the immersive lyrics view: the transport controls fade out and the
 * lyrics take the freed space, then any tap brings them back.
 *
 * Any interaction resets the timer, so the controls never vanish while someone
 * is actively reaching for them. The timer is also suspended while `enabled` is
 * false, which the caller uses to keep everything on screen when lyrics are
 * off or a dialog is open.
 */
export function useAutoHide({ delayMs = 5000, enabled = true }: UseAutoHideOptions = {}) {
  const [hidden, setHidden] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clear = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  /** Show the UI and restart the countdown. Call on any user interaction. */
  const poke = useCallback(() => {
    setHidden(false);
    clear();
    if (!enabled) return;
    timeoutRef.current = setTimeout(() => setHidden(true), delayMs);
  }, [clear, delayMs, enabled]);

  /** Show immediately without restarting (e.g. while a dialog is open). */
  const reveal = useCallback(() => {
    clear();
    setHidden(false);
  }, [clear]);

  useEffect(() => {
    if (!enabled) {
      clear();
      setHidden(false);
      return;
    }
    poke();
    return clear;
  }, [enabled, poke, clear]);

  // Always clear on unmount so a pending timer cannot fire into a dead tree.
  useEffect(() => clear, [clear]);

  return { hidden, poke, reveal };
}
