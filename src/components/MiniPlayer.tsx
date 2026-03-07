import React, { useEffect, useRef, useLayoutEffect, useState, useMemo } from 'react';
import { View, StyleSheet, TouchableOpacity, Animated, Dimensions, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { Image } from 'expo-image';
import { usePlayerStore } from '../store/playerStore';
import { jellyfinApi } from '../api/jellyfin';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../types/navigation';
import { Surface, Text, useTheme } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Play, Pause, Music, Headphones, Monitor } from 'lucide-react-native';
import { MiniProgressBar } from './MiniProgressBar';
import { LEFT_BAR_WIDTH } from '../navigation/MainNavigator';

import { audioService } from '../services/AudioService';
import { useRemoteStore } from '../store/remoteStore';
import { ConnectMenu } from './ConnectMenu';
import { Modal, Portal } from 'react-native-paper';

const SCREEN_HEIGHT = Dimensions.get('window').height;

import { useShallow } from 'zustand/react/shallow';

interface MiniPlayerProps {
    isPlayerVisible?: boolean;
    isGlobal?: boolean;
}

export default function MiniPlayer({ isPlayerVisible, isGlobal }: MiniPlayerProps) {
    const { currentTrack, isPlaying, togglePlayPause, playNext, playPrevious, reset, queueLength, repeatMode } = usePlayerStore(useShallow(state => ({
        currentTrack: state.currentTrack,
        isPlaying: state.isPlaying,
        togglePlayPause: state.togglePlayPause,
        playNext: state.playNext,
        playPrevious: state.playPrevious,
        reset: state.reset,
        queueLength: state.queue.length,
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
    const trackToRender = currentTrack || lastTrack.current;

    // Use a ref for Animated Value - Start off-screen (200)
    const translateY = useRef(new Animated.Value(200)).current;

    // Text animation values
    const textTranslateX = useRef(new Animated.Value(0)).current;
    const textOpacity = useRef(new Animated.Value(1)).current;
    const transitionDirection = useRef<'left' | 'right' | null>(null);

    // Bottom offset calculation - no bottom tab bar in landscape
    const tabBarHeight = isLandscape ? 0 : 90;
    // When rendered inside GlobalPlayer, the wrapper handles vertical positioning so we don't need a bottom offset
    const bottomOffset = isGlobal ? 0 : (tabBarHeight + 6);

    // Left offset calculation - account for left tab bar in landscape
    const leftOffset = isLandscape ? LEFT_BAR_WIDTH + 12 : 12;

    useEffect(() => {
        // Only make visible if there's a track
        if (currentTrack) {
            setIsVisible(true);
            setImageError(false); // Reset image error when track changes
        } else {
            // When track is cleared (player stopped), animate out first
            Animated.timing(translateY, {
                toValue: 200, // Slide down
                duration: 300,
                useNativeDriver: true,
            }).start(() => {
                // Once animation finishes, actually hide the component
                setIsVisible(false);
                lastTrack.current = null;
            });
        }
    }, [currentTrack]);

    useEffect(() => {
        if (!currentTrack) return; // Allow the other useEffect to handle disappearance

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

    // Gesture Handling - Using RNGH to play nicely with GlobalPlayer's gestures
    const panGesture = useMemo(() => {
        return Gesture.Pan()
            // Allow horizontal tracking (swipe left/right) and downward tracking (swipe down).
            // Prevent upward tracking so we don't block the GlobalPlayer's drag-to-expand.
            .activeOffsetX([-20, 20])
            .activeOffsetY(20)
            .onEnd((event) => {
                const { translationX, translationY } = event;

                // Vertical Swipe Down to Stop & Dismiss
                if (translationY > 40 && Math.abs(translationY) > Math.abs(translationX)) {
                    usePlayerStore.getState().reset();
                    return;
                }

                // Horizontal Swipes — read queue from store snapshot to avoid subscribing
                if (Math.abs(translationX) > 30) {
                    const { queue: currentQueue } = usePlayerStore.getState();
                    const currentIndex = currentQueue.findIndex(t => t.id === trackToRender?.id);

                    if (translationX > 0) {
                        // Swipe Right -> Previous
                        if (currentIndex > 0 || repeatMode === 'one' || (repeatMode === 'all' && currentQueue.length === 1)) {
                            transitionDirection.current = 'right';
                            playPrevious();

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
                            ]).start(() => {
                                if (repeatMode === 'one' || (repeatMode === 'all' && currentQueue.length === 1)) {
                                    textTranslateX.setValue(-50);
                                    Animated.parallel([
                                        Animated.spring(textTranslateX, { toValue: 0, useNativeDriver: true }),
                                        Animated.timing(textOpacity, { toValue: 1, duration: 300, useNativeDriver: true })
                                    ]).start();
                                }
                            });
                        }
                    } else {
                        // Swipe Left -> Next
                        if (currentIndex < currentQueue.length - 1 || repeatMode === 'one' || repeatMode === 'all') {
                            transitionDirection.current = 'left';
                            playNext();

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
                            ]).start(() => {
                                if (repeatMode === 'one' || (repeatMode === 'all' && currentQueue.length === 1)) {
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
            })
            .runOnJS(true);
    }, [trackToRender, playNext, playPrevious, repeatMode, textTranslateX, textOpacity]);

    if (!isVisible || !trackToRender) return null;

    const handlePress = () => {
        if (isGlobal) {
            usePlayerStore.getState().setPlayerExpanded(true);
            return;
        }

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
        <GestureDetector gesture={panGesture}>
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
            >
                <TouchableOpacity
                    style={styles.touchable}
                    onPress={handlePress}
                    activeOpacity={0.9}
                    accessibilityRole="button"
                    accessibilityLabel={`Now playing ${trackToRender.name} by ${trackToRender.artist}. Double tap to open player.`}
                >
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



                        <TouchableOpacity
                            onPress={togglePlayPause}
                            style={[styles.playButton, { padding: 4 }]}
                            hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }}
                            accessibilityRole="button"
                            accessibilityLabel={isPlaying ? "Pause" : "Play"}
                        >
                            {isPlaying ? (
                                <Pause size={24} color={theme.colors.onSurface} fill={theme.colors.onSurface} />
                            ) : (
                                <Play size={24} color={theme.colors.onSurface} fill={theme.colors.onSurface} style={{ marginLeft: 2 }} />
                            )}
                        </TouchableOpacity>
                    </View>
                </TouchableOpacity>
            </Animated.View>
        </GestureDetector>
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
        flex: 1,
    },
    image: {
        width: 48,
        height: 48,
        borderRadius: 8,
        margin: 8,
        backgroundColor: 'rgba(0,0,0,0.1)',
    },
    textContainer: {
        flex: 1,
        justifyContent: 'center',
        paddingRight: 8,
    },
    titleText: {
        fontWeight: '600',
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
        width: 48,
        height: 48,
        justifyContent: 'center',
        alignItems: 'center',
        paddingRight: 4,
    }
});
