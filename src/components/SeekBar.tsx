import React, { useState } from 'react';
import { View, StyleSheet, LayoutChangeEvent, PanResponder } from 'react-native';
import { useTheme } from 'react-native-paper';

interface SeekBarProps {
    progress: number; // 0 to 1
    durationMillis: number;
    onSeek: (positionMillis: number) => void;
    color?: string;
    trackColor?: string;
}

export const SeekBar: React.FC<SeekBarProps> = ({
    progress,
    durationMillis,
    onSeek,
    color,
    trackColor
}) => {
    const theme = useTheme();
    const activeColor = color || theme.colors.primary;
    const inactiveColor = trackColor || theme.colors.surfaceVariant;

    const [width, setWidth] = useState(0);
    const [isDragging, setIsDragging] = useState(false);
    const [dragProgress, setDragProgress] = useState(0);

    const onLayout = (e: LayoutChangeEvent) => {
        setWidth(e.nativeEvent.layout.width);
    };



    // Better implementation using simpler logic if possible.
    // Let's use `react-native-slider` logic if we could, but we are building custom.
    // Let's use a ref for the start progress.
    const startProgressRx = React.useRef(0);

    const panResponderImplemented = React.useMemo(() => PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onStartShouldSetPanResponderCapture: () => true,
        onMoveShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponderCapture: () => true,

        onPanResponderGrant: (evt, gestureState) => {
            setIsDragging(true);
            const locationX = evt.nativeEvent.locationX;
            const p = Math.max(0, Math.min(1, locationX / width));
            setDragProgress(p);
            startProgressRx.current = p;
        },
        onPanResponderMove: (evt, gestureState) => {
            const deltaProgress = gestureState.dx / width;
            const newProgress = Math.max(0, Math.min(1, startProgressRx.current + deltaProgress));
            setDragProgress(newProgress);
        },
        onPanResponderRelease: (evt, gestureState) => {
            const deltaProgress = gestureState.dx / width;
            const finalProgress = Math.max(0, Math.min(1, startProgressRx.current + deltaProgress));
            setIsDragging(false);
            if (durationMillis) {
                onSeek(finalProgress * durationMillis);
            }
        },
        onPanResponderTerminate: () => {
            setIsDragging(false);
        }
    }), [width, durationMillis, onSeek]);

    // Use dragProgress if dragging, otherwise prop progress
    const displayProgress = isDragging ? dragProgress : progress;

    return (
        <View style={styles.container} onLayout={onLayout} {...panResponderImplemented.panHandlers}>
            {/* HitSlop for easier grabbing isn't passed to View, but the Container is large enough */}
            <View style={styles.touchArea} pointerEvents="none">
                {/* Background Track */}
                <View style={[styles.track, { backgroundColor: inactiveColor }]} />

                {/* Active Progress Track */}
                <View style={[styles.activeTrack, { width: `${displayProgress * 100}%`, backgroundColor: activeColor }]} />

                {/* Thumb */}
                <View style={[styles.thumb, { left: `${displayProgress * 100}%`, backgroundColor: activeColor }]} />
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        height: 40, // Large height for touch area
        justifyContent: 'center',
        width: '100%',
    },
    touchArea: {
        height: '100%',
        justifyContent: 'center',
        width: '100%',
    },
    track: {
        height: 4,
        width: '100%',
        borderRadius: 2,
        position: 'absolute',
    },
    activeTrack: {
        height: 4,
        borderRadius: 2,
        position: 'absolute',
    },
    thumb: {
        width: 12,
        height: 12,
        borderRadius: 6,
        position: 'absolute',
        marginLeft: -6, // Center the thumb on the end of the bar
    }
});
