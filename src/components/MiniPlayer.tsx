import React, { useEffect, useRef, useLayoutEffect, useState, useMemo } from 'react';
import { View, StyleSheet, TouchableOpacity, Image, Animated, Dimensions, PanResponder, useWindowDimensions } from 'react-native';
import { usePlayerStore } from '../store/playerStore';
import { jellyfinApi } from '../api/jellyfin';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../types/navigation';
import { Surface, Text, useTheme } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Play, Pause, Music } from 'lucide-react-native';
import { MiniProgressBar } from './MiniProgressBar';
import { LEFT_BAR_WIDTH } from '../navigation/MainNavigator';

const SCREEN_HEIGHT = Dimensions.get('window').height;

import { useShallow } from 'zustand/react/shallow';

interface MiniPlayerProps {
    isPlayerVisible?: boolean;
}

export default function MiniPlayer({ isPlayerVisible }: MiniPlayerProps) {
    const { currentTrack, isPlaying, togglePlayPause, playNext, playPrevious, reset, queue, repeatMode } = usePlayerStore(useShallow(state => ({
        currentTrack: state.currentTrack,
        isPlaying: state.isPlaying,
        togglePlayPause: state.togglePlayPause,
        playNext: state.playNext,
        playPrevious: state.playPrevious,
        reset: state.reset,
        queue: state.queue,
        repeatMode: state.repeatMode
    })));
    const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
    const theme = useTheme();
    const { width, height } = useWindowDimensions();
    const isLandscape = width > height;

    // Visibility State & Track Persistence
    const [isVisible, setIsVisible] = useState(!!currentTrack);
    const [imageError, setImageError] = useState(false);
    const lastTrack = useRef(currentTrack);
    // Don't update lastTrack here - it breaks the animation detection
    // lastTrack is updated only: 1) after animation completes, 2) when track becomes null
    const trackToRender = currentTrack || lastTrack.current;

    // Use a ref for Animated Value - Start off-screen (200)
    const translateY = useRef(new Animated.Value(200)).current;

    // Text animation values
    const textTranslateX = useRef(new Animated.Value(0)).current;
    const textOpacity = useRef(new Animated.Value(1)).current;
    const transitionDirection = useRef<'left' | 'right' | null>(null);

    // Bottom offset calculation - no bottom tab bar in landscape
    const tabBarHeight = isLandscape ? 0 : 90;
    const bottomOffset = tabBarHeight + 12;

    // Left offset calculation - account for left tab bar in landscape
    const leftOffset = isLandscape ? LEFT_BAR_WIDTH + 12 : 12;

    useEffect(() => {
        setIsVisible(!!currentTrack);
        setImageError(false); // Reset image error when track changes
    }, [currentTrack]);

    useEffect(() => {
        const targetY = (isVisible && !isPlayerVisible) ? 0 : 200;

        Animated.spring(translateY, {
            toValue: targetY,
            useNativeDriver: true,
            speed: 12,
            bounciness: 4,
        }).start();
    }, [isVisible, isPlayerVisible, bottomOffset]);

    // Track Transition Animation
    useLayoutEffect(() => {
        // If this is the first track (lastTrack is null), just update the ref
        if (!lastTrack.current && currentTrack) {
            lastTrack.current = currentTrack;
            return;
        }

        // If track changed, animate the transition
        if (currentTrack && lastTrack.current && currentTrack.id !== lastTrack.current.id) {
            transitionDirection.current = 'right';

            // Slide out to left
            Animated.parallel([
                Animated.timing(textTranslateX, {
                    toValue: -50,
                    duration: 200,
                    useNativeDriver: true,
                }),
                Animated.timing(textOpacity, {
                    toValue: 0,
                    duration: 200,
                    useNativeDriver: true,
                })
            ]).start(() => {
                // Update ref AFTER animation completes
                lastTrack.current = currentTrack;
                // Reset position to right
                textTranslateX.setValue(50);

                // Slide in from right
                Animated.parallel([
                    Animated.spring(textTranslateX, {
                        toValue: 0,
                        useNativeDriver: true,
                    }),
                    Animated.timing(textOpacity, {
                        toValue: 1,
                        duration: 300,
                        useNativeDriver: true,
                    })
                ]).start();
            });
        }
    }, [currentTrack]);

    // Gesture Handling - Use useMemo with dependencies to avoid stale closures
    const panResponder = useMemo(
        () => PanResponder.create({
            onStartShouldSetPanResponder: () => false, // Let touches pass through initially (for click)
            onMoveShouldSetPanResponder: (_: any, gestureState: any) => {
                // Capture if swipe is significant
                const { dx, dy } = gestureState;
                // Use a lower threshold (10) to catch swipes early
                return Math.abs(dx) > 10 || Math.abs(dy) > 10;
            },
            onPanResponderTerminationRequest: () => false, // Don't let others (ScrollView etc) steal it
            onPanResponderRelease: (_: any, gestureState: any) => {
                const { dx, dy } = gestureState;

                // Swipe Down (Close & Stop)
                if (dy > 30) {
                    reset(); // Stop audio and clear track (closes player)
                    return;
                }

                // Swipe Up (Open full player)
                if (dy < -30) {
                    navigation.navigate('Player');
                    return;
                }

                // Horizontal Swipes
                if (Math.abs(dx) > 30) {
                    const currentIndex = queue.findIndex(t => t.id === trackToRender?.id);

                    if (dx > 0) {
                        // Drag Left -> Right (Swipe Right) -> Previous
                        if (currentIndex > 0 || repeatMode === 'one' || (repeatMode === 'all' && queue.length === 1)) {
                            transitionDirection.current = 'right';
                            Animated.parallel([
                                Animated.timing(textTranslateX, {
                                    toValue: 50,
                                    duration: 150,
                                    useNativeDriver: true,
                                }),
                                Animated.timing(textOpacity, {
                                    toValue: 0,
                                    duration: 150,
                                    useNativeDriver: true,
                                })
                            ]).start(async () => {
                                await playPrevious();

                                // Restore text if track won't change (Repeat One or Single Track Loop)
                                if (repeatMode === 'one' || (repeatMode === 'all' && queue.length === 1)) {
                                    // Reset position to LEFT (since we swiped right, we want it to come from left? Or standard next/prev logic?)
                                    // Usually Prev comes from Left. Next comes from Right.
                                    // Above we moved TO 50 (Right).
                                    // So we should appear from -50 (Left)?
                                    // The effect does: reset to 50 (Right) then slide to 0. But that's hardcoded for Next?
                                    // Wait, the effect sets transitionDirection='right' but code effectively assumes Next.

                                    // For PREV: Slide OUT to Right (50). Slide IN from Left (-50).
                                    textTranslateX.setValue(-50);
                                    Animated.parallel([
                                        Animated.spring(textTranslateX, { toValue: 0, useNativeDriver: true }),
                                        Animated.timing(textOpacity, { toValue: 1, duration: 300, useNativeDriver: true })
                                    ]).start();
                                }
                            });
                        }
                    } else {
                        // Drag Right -> Left (Swipe Left) -> Next
                        if (currentIndex < queue.length - 1 || repeatMode === 'one' || repeatMode === 'all') {
                            transitionDirection.current = 'left';
                            Animated.parallel([
                                Animated.timing(textTranslateX, {
                                    toValue: -50,
                                    duration: 150,
                                    useNativeDriver: true,
                                }),
                                Animated.timing(textOpacity, {
                                    toValue: 0,
                                    duration: 150,
                                    useNativeDriver: true,
                                })
                            ]).start(async () => {
                                await playNext();

                                // Restore text if track won't change
                                if (repeatMode === 'one' || (repeatMode === 'all' && queue.length === 1)) {
                                    // For NEXT: Slide OUT to Left (-50). Slide IN from Right (50).
                                    textTranslateX.setValue(50);
                                    Animated.parallel([
                                        Animated.spring(textTranslateX, { toValue: 0, useNativeDriver: true }),
                                        Animated.timing(textOpacity, { toValue: 1, duration: 300, useNativeDriver: true })
                                    ]).start();
                                }
                            });
                        }
                    }
                }
            },
        }),
        [queue, trackToRender, reset, playNext, playPrevious, navigation, textTranslateX, textOpacity, repeatMode]
    );

    if (!isVisible || !trackToRender) return null;

    const handlePress = () => {
        // Slide down FAST
        Animated.timing(translateY, {
            toValue: 200,
            duration: 150,
            useNativeDriver: true,
        }).start(() => {
            // THEN navigate
            navigation.navigate('Player');
        });
    };



    // Animate the style
    const animatedStyle = {
        transform: [{ translateY }],
        bottom: bottomOffset, // Base position
    };

    return (
        <Animated.View
            style={[
                styles.container,
                animatedStyle,
                {
                    backgroundColor: theme.colors.elevation.level2,
                    elevation: 4,
                    left: leftOffset,
                }
            ]}
            {...panResponder.panHandlers}
        >
            <TouchableOpacity style={styles.touchable} onPress={handlePress} activeOpacity={0.9}>
                <MiniProgressBar />
                <View style={styles.content}>
                    {trackToRender.imageUrl && !imageError ? (
                        <Image
                            source={{ uri: trackToRender.imageUrl }}
                            style={styles.image}
                            onError={() => setImageError(true)}
                        />
                    ) : (
                        <View style={[styles.image, { justifyContent: 'center', alignItems: 'center' }]}>
                            <Music size={24} color={theme.colors.onSurfaceVariant} />
                        </View>
                    )}
                    <Animated.View style={[styles.textContainer, { transform: [{ translateX: textTranslateX }], opacity: textOpacity }]}>
                        <Text variant="titleSmall" numberOfLines={1} style={styles.titleText}>{trackToRender.name}</Text>
                        <Text variant="bodySmall" numberOfLines={1} style={{ color: theme.colors.onSurfaceVariant }}>{trackToRender.artist}</Text>
                    </Animated.View>

                    <TouchableOpacity onPress={togglePlayPause} style={styles.playButton} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                        {isPlaying ? (
                            <Pause size={24} color={theme.colors.onSurface} fill={theme.colors.onSurface} />
                        ) : (
                            <Play size={24} color={theme.colors.onSurface} fill={theme.colors.onSurface} style={{ marginLeft: 2 }} />
                        )}
                    </TouchableOpacity>
                </View>
            </TouchableOpacity>
        </Animated.View>
    );
}

const styles = StyleSheet.create({
    container: {
        position: 'absolute',
        left: 12,
        right: 12,
        height: 64,
        borderRadius: 12,
        overflow: 'hidden',
        // Elevation needs to be on this container
        elevation: 4,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.25,
        shadowRadius: 3.84,
    },
    touchable: {
        flex: 1,
        justifyContent: 'center',
    },
    content: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingVertical: 8,
    },
    image: {
        width: 48,
        height: 48,
        borderRadius: 8,
        backgroundColor: 'rgba(255, 255, 255, 0.1)',
    },
    textContainer: {
        flex: 1,
        marginLeft: 12,
        marginRight: 16,
        justifyContent: 'center',
    },
    titleText: {
        fontWeight: 'bold',
        marginBottom: 2,
    },
    progressBarBackground: {
        height: 2,
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 1,
    },
    progressBarFill: {
        height: '100%',
    },
    playButton: {
        margin: 0,
    }
});
