import React, { useMemo, useState, useEffect, useRef } from 'react';
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

// Fixed-index artwork slot that NEVER unmounts — only updates its source prop.
// This eliminates the flash caused by key-driven unmount/remount cycles.
function ArtworkSlot({
    track,
    size,
    borderRadius,
    offsetPosition,
}: {
    track: Track | null;
    size: number;
    borderRadius: number;
    offsetPosition: number;
}) {
    const theme = useTheme();

    if (!track) {
        return <View style={[StyleSheet.absoluteFill, { left: offsetPosition, width: '100%', height: size }]} />;
    }

    return (
        <View style={[StyleSheet.absoluteFill, { left: offsetPosition, width: '100%', height: size, alignItems: 'center', justifyContent: 'center' }]}>
            <Surface style={{ elevation: 8, borderRadius, backgroundColor: 'transparent' }} elevation={5}>
                {track.imageUrl ? (
                    <ExpoImage
                        source={{ uri: track.imageUrl }}
                        style={{ width: size, height: size, borderRadius }}
                        contentFit="cover"
                        cachePolicy="memory-disk"
                        recyclingKey={track.id}
                        transition={0}
                    />
                ) : (
                    <View style={{ width: size, height: size, borderRadius, backgroundColor: theme.colors.surfaceVariant, justifyContent: 'center', alignItems: 'center' }}>
                        <Icon name="music-note" size={size * 0.4} color={theme.colors.onSurfaceVariant} />
                    </View>
                )}
            </Surface>
        </View>
    );
}

export default function ArtworkCarousel({ size, borderRadius = 12 }: Props) {
    const { currentTrack, queue, repeatMode, playNext, playPrevious } = usePlayerStore(useShallow(state => ({
        currentTrack: state.currentTrack,
        queue: state.queue,
        repeatMode: state.repeatMode,
        playNext: state.playNext,
        playPrevious: state.playPrevious,
    })));

    const { width: SCREEN_WIDTH } = Dimensions.get('window');

    // The "committed" track — the track whose artwork is centered at translateX=0
    const [committedTrack, setCommittedTrack] = useState<Track | null>(currentTrack);
    const committedTrackRef = useRef<Track | null>(currentTrack);
    const suppressSyncRef = useRef(false);

    const translateX = useSharedValue(0);

    const handleSwipeComplete = (targetTrack: Track | null, direction: 'next' | 'prev') => {
        if (targetTrack) {
            suppressSyncRef.current = true;
            translateX.value = 0;
            committedTrackRef.current = targetTrack;
            setCommittedTrack(targetTrack);
        }
        if (direction === 'next') playNext();
        else playPrevious();
    };

    // Sync from external store changes
    useEffect(() => {
        if (!currentTrack) return;

        if (suppressSyncRef.current) {
            if (currentTrack.id === committedTrackRef.current?.id) {
                suppressSyncRef.current = false;
            } else {
                suppressSyncRef.current = false;
                translateX.value = 0;
                committedTrackRef.current = currentTrack;
                setCommittedTrack(currentTrack);
            }
            return;
        }

        if (currentTrack.id !== committedTrackRef.current?.id) {
            translateX.value = 0;
            committedTrackRef.current = currentTrack;
            setCommittedTrack(currentTrack);
        }
    }, [currentTrack?.id]);

    // Safety timeout for suppressSync
    useEffect(() => {
        if (suppressSyncRef.current) {
            const timeout = setTimeout(() => {
                if (suppressSyncRef.current) {
                    suppressSyncRef.current = false;
                    if (currentTrack && currentTrack.id !== committedTrackRef.current?.id) {
                        translateX.value = 0;
                        committedTrackRef.current = currentTrack;
                        setCommittedTrack(currentTrack);
                    }
                }
            }, 1000);
            return () => clearTimeout(timeout);
        }
    }, [committedTrack?.id]);

    const { prevTrack, nextTrack } = useMemo(() => {
        if (!committedTrack || queue.length <= 1) return { prevTrack: null, nextTrack: null };
        const index = queue.findIndex(t => t.id === committedTrack.id);
        if (index === -1) return { prevTrack: null, nextTrack: null };

        let prev = null;
        let next = null;
        if (index > 0) prev = queue[index - 1];
        else if (repeatMode === 'all') prev = queue[queue.length - 1];

        if (index < queue.length - 1) next = queue[index + 1];
        else if (repeatMode === 'all') next = queue[0];

        return { prevTrack: prev, nextTrack: next };
    }, [committedTrack?.id, queue, repeatMode]);

    const SWIPE_THRESHOLD = SCREEN_WIDTH * 0.2;

    const panGesture = Gesture.Pan()
        .activeOffsetX([-5, 5])
        .failOffsetY([-15, 15])
        .onUpdate((e) => {
            translateX.value = e.translationX;
        })
        .onEnd((e) => {
            if (e.translationX < -SWIPE_THRESHOLD || e.velocityX < -800) {
                if (nextTrack || repeatMode === 'one') {
                    const targetTrack = nextTrack || committedTrack;
                    translateX.value = withTiming(-SCREEN_WIDTH, { duration: 250 }, (finished) => {
                        if (finished) runOnJS(handleSwipeComplete)(targetTrack, 'next');
                    });
                } else {
                    translateX.value = withSpring(0, { overshootClamping: true });
                }
            } else if (e.translationX > SWIPE_THRESHOLD || e.velocityX > 800) {
                if (prevTrack || repeatMode === 'one' || (repeatMode === 'all' && queue.length === 1)) {
                    const targetTrack = prevTrack || committedTrack;
                    translateX.value = withTiming(SCREEN_WIDTH, { duration: 250 }, (finished) => {
                        if (finished) runOnJS(handleSwipeComplete)(targetTrack, 'prev');
                    });
                } else {
                    translateX.value = withSpring(0, { overshootClamping: true });
                }
            } else {
                translateX.value = withSpring(0, { overshootClamping: true });
            }
        });

    const animatedStyle = useAnimatedStyle(() => ({
        transform: [{ translateX: translateX.value }]
    }));

    return (
        <View style={{ width: '100%', height: size }}>
            <GestureDetector gesture={panGesture}>
                <Animated.View style={[{ flex: 1 }, animatedStyle]}>
                    {/* 3 stable child slots — React matches by INDEX, never unmounts */}
                    <ArtworkSlot track={prevTrack} size={size} borderRadius={borderRadius} offsetPosition={-SCREEN_WIDTH} />
                    <ArtworkSlot track={committedTrack} size={size} borderRadius={borderRadius} offsetPosition={0} />
                    <ArtworkSlot track={nextTrack} size={size} borderRadius={borderRadius} offsetPosition={SCREEN_WIDTH} />
                </Animated.View>
            </GestureDetector>
        </View>
    );
}
