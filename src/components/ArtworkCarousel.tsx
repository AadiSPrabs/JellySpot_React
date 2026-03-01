import React, { useMemo, useState, useEffect } from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withTiming,
    withSpring,
    runOnJS
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { Image as ExpoImage } from 'expo-image';
import { Surface, useTheme } from 'react-native-paper';
import { MaterialCommunityIcons as Icon } from '@expo/vector-icons';
import { usePlayerStore } from '../store/playerStore';
import { useShallow } from 'zustand/react/shallow';
import { Track } from '../types/track';

interface Props {
    size: number;
    borderRadius?: number;
}

export default function ArtworkCarousel({ size, borderRadius = 12 }: Props) {
    const theme = useTheme();
    const { currentTrack, queue, repeatMode, playNext, playPrevious } = usePlayerStore(useShallow(state => ({
        currentTrack: state.currentTrack,
        queue: state.queue,
        repeatMode: state.repeatMode,
        playNext: state.playNext,
        playPrevious: state.playPrevious
    })));

    const { width: SCREEN_WIDTH } = Dimensions.get('window');

    // Optimistic UI state to prevent flashing old artwork during native track change delay
    const [optimisticTrack, setOptimisticTrack] = useState<Track | null>(null);

    const [artworkError, setArtworkError] = useState(false);
    useEffect(() => {
        setArtworkError(false);
    }, [currentTrack?.imageUrl]);

    // Clear optimistic override once the real native player catches up
    useEffect(() => {
        if (optimisticTrack && currentTrack?.id === optimisticTrack.id) {
            setOptimisticTrack(null);
        }
    }, [currentTrack?.id, optimisticTrack]);

    const displayTrack = optimisticTrack || currentTrack;
    const translateX = useSharedValue(0);

    // Calculate Prev and Next tracks based on displayTrack, to keep UI stable during transition
    const { prevTrack, nextTrack } = useMemo(() => {
        if (!displayTrack || queue.length <= 1) return { prevTrack: null, nextTrack: null };
        const index = queue.findIndex(t => t.id === displayTrack.id);
        if (index === -1) return { prevTrack: null, nextTrack: null };

        let prev = null;
        let next = null;
        if (index > 0) prev = queue[index - 1];
        else if (repeatMode === 'all') prev = queue[queue.length - 1];

        if (index < queue.length - 1) next = queue[index + 1];
        else if (repeatMode === 'all') next = queue[0];

        return { prevTrack: prev, nextTrack: next };
    }, [displayTrack?.id, queue, repeatMode]);

    const SWIPE_THRESHOLD = SCREEN_WIDTH * 0.2;

    const handleSwipeComplete = (targetTrack: Track | null, direction: 'next' | 'prev') => {
        if (targetTrack) {
            setOptimisticTrack(targetTrack);
        }
        translateX.value = 0; // instantly reset layout for the new optimistic center
        if (direction === 'next') playNext();
        else playPrevious();
    };

    const panGesture = Gesture.Pan()
        .activeOffsetX([-5, 5]) // Capture horizontal swipes very quickly to prevent vertical scroll takeover
        .failOffsetY([-15, 15]) // Explicitly fail this gesture if user moves vertically too much
        .onUpdate((e) => {
            translateX.value = e.translationX;
        })
        .onEnd((e) => {
            if (e.translationX < -SWIPE_THRESHOLD || e.velocityX < -800) {
                // Swipe Left -> Next Track
                if (nextTrack || repeatMode === 'one') {
                    const targetTrack = nextTrack || displayTrack;
                    translateX.value = withTiming(-SCREEN_WIDTH, { duration: 250 }, (finished) => {
                        if (finished) runOnJS(handleSwipeComplete)(targetTrack, 'next');
                    });
                } else {
                    translateX.value = withSpring(0, { overshootClamping: true });
                }
            } else if (e.translationX > SWIPE_THRESHOLD || e.velocityX > 800) {
                // Swipe Right -> Previous Track
                if (prevTrack || repeatMode === 'one' || (repeatMode === 'all' && queue.length === 1)) {
                    const targetTrack = prevTrack || displayTrack;
                    translateX.value = withTiming(SCREEN_WIDTH, { duration: 250 }, (finished) => {
                        if (finished) runOnJS(handleSwipeComplete)(targetTrack, 'prev');
                    });
                } else {
                    translateX.value = withSpring(0, { overshootClamping: true });
                }
            } else {
                // Snap back
                translateX.value = withSpring(0, { overshootClamping: true });
            }
        });

    const animatedStyle = useAnimatedStyle(() => ({
        transform: [{ translateX: translateX.value }]
    }));

    const renderArtwork = (track: Track | null, offsetMultiplier: number) => {
        if (!track) return null;

        // Position it SCREEN_WIDTH away, so it enters from off-screen
        const offsetPosition = SCREEN_WIDTH * offsetMultiplier;

        return (
            <View style={[StyleSheet.absoluteFill, { left: offsetPosition, width: '100%', height: size, alignItems: 'center', justifyContent: 'center' }]}>
                <Surface style={{ elevation: 8, borderRadius, backgroundColor: 'transparent' }} elevation={5}>
                    {track.imageUrl && (!artworkError || offsetMultiplier !== 0) ? (
                        <ExpoImage
                            source={{ uri: track.imageUrl }}
                            style={{ width: size, height: size, borderRadius }}
                            contentFit="cover"
                            transition={offsetMultiplier === 0 ? 500 : 0}
                            onError={() => { if (offsetMultiplier === 0) setArtworkError(true) }}
                        />
                    ) : (
                        <View style={{ width: size, height: size, borderRadius, backgroundColor: theme.colors.surfaceVariant, justifyContent: 'center', alignItems: 'center' }}>
                            <Icon name="music-note" size={size * 0.4} color={theme.colors.onSurfaceVariant} />
                        </View>
                    )}
                </Surface>
            </View>
        );
    };

    return (
        <View style={{ width: '100%', height: size }}>
            <GestureDetector gesture={panGesture}>
                <Animated.View style={[{ flex: 1 }, animatedStyle]}>
                    {renderArtwork(prevTrack, -1)}
                    {renderArtwork(displayTrack, 0)}
                    {renderArtwork(nextTrack, 1)}
                </Animated.View>
            </GestureDetector>
        </View>
    );
}
