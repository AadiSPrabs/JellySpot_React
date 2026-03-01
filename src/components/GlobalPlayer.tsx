import React, { useEffect, useState } from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withSpring,
    interpolate,
    Extrapolate,
    runOnJS
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { usePlayerStore } from '../store/playerStore';
import { useShallow } from 'zustand/react/shallow';
import MiniPlayer from './MiniPlayer';
import PlayerScreen from '../screens/PlayerScreen';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { audioService } from '../services/AudioService';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
// Height of the MiniPlayer roughly + bottom insets. We'll adjust as needed.
const MINIPLAYER_HEIGHT = 64;
const DRAG_THRESHOLD = 100;

export default function GlobalPlayer() {
    const { currentTrack, isPlayerExpanded, setPlayerExpanded } = usePlayerStore(useShallow(state => ({
        currentTrack: state.currentTrack,
        isPlayerExpanded: state.isPlayerExpanded,
        setPlayerExpanded: state.setPlayerExpanded
    })));

    const { width, height } = Dimensions.get('window');
    const isLandscape = width > height;

    // Offset from the bottom for MiniPlayer
    // Tab bar is explicitly 90px in MainNavigator. So we sit perfectly spaced above it.
    const BOTTOM_OFFSET = isLandscape ? 12 : 90 + 6;
    const COLLAPSED_Y = SCREEN_HEIGHT - (MINIPLAYER_HEIGHT + BOTTOM_OFFSET);
    const EXPANDED_Y = 0;

    const SPRING_CONFIG = { damping: 25, stiffness: 200, overshootClamping: true };

    const translateY = useSharedValue(COLLAPSED_Y);
    const startY = useSharedValue(0);
    const [isVisible, setIsVisible] = useState(false);

    useEffect(() => {
        if (currentTrack) {
            setIsVisible(true);
            // On track appearance, animate to correct position if it was hidden
            if (isPlayerExpanded) {
                translateY.value = withSpring(EXPANDED_Y, SPRING_CONFIG);
            } else {
                translateY.value = withSpring(COLLAPSED_Y, SPRING_CONFIG);
            }
        } else {
            // Animate down, then unmount
            translateY.value = withSpring(COLLAPSED_Y + 200, SPRING_CONFIG, (finished) => {
                if (finished) {
                    runOnJS(setIsVisible)(false);
                }
            });
        }
    }, [currentTrack, isPlayerExpanded, COLLAPSED_Y]);

    const dismissPlayer = () => {
        audioService.stop();
    };

    const panGesture = Gesture.Pan()
        // Capture as long as there is strong vertical movement and little horizontal movement
        .activeOffsetY([-20, 20])
        // Give a generous horizontal fail boundary. Anything purely horizontal fails this,
        // letting MiniPlayer and ArtworkCarousel catch the horizontal swipe.
        .failOffsetX([-40, 40])
        .onStart(() => {
            startY.value = translateY.value;
        })
        .onUpdate((event) => {
            let newValue = startY.value + event.translationY;
            // Bound between EXPANDED_Y and allowing dragging DOWN past COLLAPSED_Y to dismiss
            if (newValue < EXPANDED_Y) newValue = EXPANDED_Y;
            if (newValue > COLLAPSED_Y + 200) newValue = COLLAPSED_Y + 200;
            translateY.value = newValue;
        })
        .onEnd((event) => {
            if (isPlayerExpanded) {
                // We are currently expanded; user can only drag DOWN to collapse.
                if (translateY.value > EXPANDED_Y + (SCREEN_HEIGHT * 0.15) || event.velocityY > 500) {
                    translateY.value = withSpring(COLLAPSED_Y, SPRING_CONFIG);
                    runOnJS(setPlayerExpanded)(false);
                } else {
                    translateY.value = withSpring(EXPANDED_Y, SPRING_CONFIG);
                }
            } else {
                // We are currently collapsed
                if (translateY.value < COLLAPSED_Y - DRAG_THRESHOLD || event.velocityY < -500) {
                    translateY.value = withSpring(EXPANDED_Y, SPRING_CONFIG);
                    runOnJS(setPlayerExpanded)(true);
                } else if (translateY.value > COLLAPSED_Y + 40 || event.velocityY > 500) {
                    // Swiped Down to stop/dismiss
                    runOnJS(dismissPlayer)();
                    // The useEffect will handle the rest of the animation and unmounting.
                } else {
                    translateY.value = withSpring(COLLAPSED_Y, SPRING_CONFIG);
                }
            }
        });

    const containerStyle = useAnimatedStyle(() => {
        return {
            transform: [{ translateY: translateY.value }]
        };
    });

    const miniPlayerStyle = useAnimatedStyle(() => {
        // Fade in only at the very end of the collapse animation
        const opacity = interpolate(
            translateY.value,
            [COLLAPSED_Y - (SCREEN_HEIGHT * 0.2), COLLAPSED_Y],
            [0, 1],
            Extrapolate.CLAMP
        );
        return {
            opacity,
            pointerEvents: opacity === 0 ? 'none' : 'auto'
        };
    });

    const fullPlayerStyle = useAnimatedStyle(() => {
        const opacity = interpolate(
            translateY.value,
            [EXPANDED_Y, COLLAPSED_Y],
            [1, 0],
            Extrapolate.CLAMP
        );
        return {
            opacity,
            pointerEvents: opacity === 0 ? 'none' : 'auto'
        };
    });

    if (!isVisible) return null;

    return (
        <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
            <GestureDetector gesture={panGesture}>
                <Animated.View style={[styles.playerContainer, containerStyle]} pointerEvents={isPlayerExpanded ? "auto" : "box-none"}>
                    {/* Fullscreen Player Layer */}
                    <Animated.View style={[StyleSheet.absoluteFill, fullPlayerStyle]}>
                        <PlayerScreen isGlobal={true} />
                    </Animated.View>

                    {/* MiniPlayer Layer handles its own touches and gesture activation */}
                    <Animated.View style={[styles.miniPlayerWrapper, miniPlayerStyle]}>
                        <MiniPlayer isGlobal={true} />
                    </Animated.View>
                </Animated.View>
            </GestureDetector>
        </View>
    );
}

const styles = StyleSheet.create({
    playerContainer: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'transparent',
    },
    miniPlayerWrapper: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: 64, // Matches the MiniPlayer height roughly
    }
});
