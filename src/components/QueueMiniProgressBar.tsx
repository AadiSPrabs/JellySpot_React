import React from 'react';
import { View, StyleSheet } from 'react-native';
import { usePlayerStore } from '../store/playerStore';
import { useShallow } from 'zustand/react/shallow';

interface QueueMiniProgressBarProps {
  /** Fill colour - usually the player's dynamic accent. */
  color: string;
  /** Track colour. Defaults to a translucent white suited to dark overlays. */
  trackColor?: string;
  height?: number;
}

/**
 * Thin playback progress bar for the queue's mini player.
 *
 * This subscribes to `positionMillis` itself so the frequent position updates
 * re-render only this bar rather than the whole PlayerScreen. That is the same
 * pattern ProgressControl uses.
 */
export const QueueMiniProgressBar = ({
  color,
  trackColor = 'rgba(255,255,255,0.18)',
  height = 3,
}: QueueMiniProgressBarProps) => {
  const { positionMillis, durationMillis } = usePlayerStore(
    useShallow((state) => ({
      positionMillis: state.positionMillis,
      durationMillis: state.durationMillis,
    })),
  );

  const progress = durationMillis > 0
    ? Math.min(1, Math.max(0, positionMillis / durationMillis))
    : 0;

  return (
    <View style={[styles.track, { backgroundColor: trackColor, height }]}>
      <View
        style={[
          styles.fill,
          { width: `${progress * 100}%`, backgroundColor: color },
        ]}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  track: {
    width: '100%',
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
  },
});
