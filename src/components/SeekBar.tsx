import React, { useState, useEffect } from 'react';
import { View, StyleSheet, LayoutChangeEvent } from 'react-native';
import { useTheme } from 'react-native-paper';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withTiming,
    withSpring,
    runOnJS
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';

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

    const [width, setWidth] = useState(1);
    const isDragging = useSharedValue(false);
    
    // Shared values for UI-thread fluid animation
    const panProgress = useSharedValue(0); 
    const displayProgress = useSharedValue(0); 

    // Smoothly interpolate incoming network/play progress when NOT dragging
    useEffect(() => {
        if (!isDragging.value) {
            // Using withSpring here makes general playback look extremely smooth instead of linear stuttering
            displayProgress.value = withTiming(progress, { duration: 250 });
        }
    }, [progress]);

    const onLayout = (e: LayoutChangeEvent) => {
        setWidth(Math.max(1, e.nativeEvent.layout.width));
    };

    const handleSeekEnd = (newProgress: number) => {
        if (durationMillis) {
            onSeek(newProgress * durationMillis);
        }
    };

    const panGesture = Gesture.Pan()
        .onStart((e) => {
            isDragging.value = true;
            // Instantly snap to grabbed position
            const p = Math.max(0, Math.min(1, e.x / width));
            panProgress.value = p;
            displayProgress.value = p; // Instant feedback
        })
        .onUpdate((e) => {
            // Update scrub position exclusively on UI thread
            const p = Math.max(0, Math.min(1, e.x / width));
            panProgress.value = p;
            displayProgress.value = p;
        })
        .onEnd(() => {
            isDragging.value = false;
            runOnJS(handleSeekEnd)(panProgress.value);
        });

    // Tight iOS-style Spring configuration 
    const SPRING_CONFIG = { mass: 1, damping: 25, stiffness: 350 };

    const trackStyle = useAnimatedStyle(() => {
        // Track height expands smoothly when dragging
        const height = withSpring(isDragging.value ? 8 : 4, SPRING_CONFIG);
        return { height };
    });

    const activeTrackStyle = useAnimatedStyle(() => {
        const height = withSpring(isDragging.value ? 8 : 4, SPRING_CONFIG);
        return {
            height,
            width: `${displayProgress.value * 100}%`
        };
    });

    const thumbStyle = useAnimatedStyle(() => {
        // Thumb scales up beautifully when grabbed
        const scale = withSpring(isDragging.value ? 1.5 : 1, SPRING_CONFIG);
        return {
            left: `${displayProgress.value * 100}%`,
            transform: [{ scale }]
        };
    });

    return (
        <GestureDetector gesture={panGesture}>
            <View style={styles.container} onLayout={onLayout}>
                <View style={styles.touchArea} pointerEvents="none">
                    {/* Background Track */}
                    <Animated.View style={[styles.track, trackStyle, { backgroundColor: inactiveColor }]} />

                    {/* Active Progress Track */}
                    <Animated.View style={[styles.activeTrack, activeTrackStyle, { backgroundColor: activeColor }]} />

                    {/* Thumb */}
                    <Animated.View style={[styles.thumb, thumbStyle, { backgroundColor: activeColor }]} />
                </View>
            </View>
        </GestureDetector>
    );
};

const styles = StyleSheet.create({
    container: {
        height: 48, // Generous height for easier scrubbing touch target
        justifyContent: 'center',
        width: '100%',
    },
    touchArea: {
        height: '100%',
        justifyContent: 'center',
        width: '100%',
    },
    track: {
        width: '100%',
        borderRadius: 4,
        position: 'absolute',
    },
    activeTrack: {
        borderRadius: 4,
        position: 'absolute',
    },
    thumb: {
        width: 14,
        height: 14,
        borderRadius: 7,
        position: 'absolute',
        marginLeft: -7,
        elevation: 2, // Tiny shadow
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.2,
        shadowRadius: 1.41,
    }
});
