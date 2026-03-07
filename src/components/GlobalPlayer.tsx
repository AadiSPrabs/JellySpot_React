import React, { useEffect, useState } from 'react';
import { View, StyleSheet, useWindowDimensions } from 'react-native';
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


// Height of the MiniPlayer roughly + bottom insets. We'll adjust as needed.
const MINIPLAYER_HEIGHT = 64;
const DRAG_THRESHOLD = 100;

export default function GlobalPlayer() {
    const { currentTrack, isPlayerExpanded, setPlayerExpanded, heroCardVisible } = usePlayerStore(useShallow(state => ({
        currentTrack: state.currentTrack,
        isPlayerExpanded: state.isPlayerExpanded,
        setPlayerExpanded: state.setPlayerExpanded,
        heroCardVisible: state.heroCardVisible,
    })));

    const { width, height: SCREEN_HEIGHT } = useWindowDimensions();
    const isLandscape = width > SCREEN_HEIGHT;

    // Offset from the bottom for MiniPlayer
    // Tab bar is explicitly 90px in MainNavigator. So we sit perfectly spaced above it.
    const BOTTOM_OFFSET = isLandscape ? 12 : 90 + 6;
    const COLLAPSED_Y = SCREEN_HEIGHT - (MINIPLAYER_HEIGHT + BOTTOM_OFFSET);
    const EXPANDED_Y = 0;

    const SPRING_CONFIG = { damping: 25, stiffness: 200, overshootClamping: true };

    const translateY = useSharedValue(COLLAPSED_Y + 200); // Initialize offscreen
    const startY = useSharedValue(0);
    const isExpandedShared = useSharedValue(isPlayerExpanded);

    // Keep UI thread state in sync with JS state
    useEffect(() => {
        isExpandedShared.value = isPlayerExpanded;
    }, [isPlayerExpanded, isExpandedShared]);


    // Keep track of previous COLLAPSED_Y to animate on rotation
    useEffect(() => {
        // If track exists and player is NOT expanded, animate to new collapsed Y
        if (currentTrack && !isPlayerExpanded) {
            translateY.value = withSpring(COLLAPSED_Y, {
                damping: 20,
                stiffness: 150,
                overshootClamping: true
            });
        }
    }, [COLLAPSED_Y]);

    useEffect(() => {
        if (currentTrack) {
            // On track appearance, animate to correct position if it was hidden
            if (isPlayerExpanded) {
                translateY.value = withSpring(EXPANDED_Y, SPRING_CONFIG);
            } else if (heroCardVisible) {
                // Hero card visible: slide mini player off-screen
                translateY.value = withSpring(COLLAPSED_Y + 200, SPRING_CONFIG);
            } else {
                translateY.value = withSpring(COLLAPSED_Y, SPRING_CONFIG);
            }
        } else {
            // Animate down off-screen
            translateY.value = withSpring(COLLAPSED_Y + 200, SPRING_CONFIG);
        }
    }, [currentTrack, isPlayerExpanded, COLLAPSED_Y, heroCardVisible]);

    const dismissPlayer = () => {
        usePlayerStore.getState().reset();
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
            if (isExpandedShared.value) {
                // We are currently expanded; user can only drag DOWN to collapse.
                if (translateY.value > EXPANDED_Y + (SCREEN_HEIGHT * 0.15) || event.velocityY > 500) {
                    translateY.value = withSpring(COLLAPSED_Y, SPRING_CONFIG);
                    isExpandedShared.value = false;
                    runOnJS(setPlayerExpanded)(false);
                } else {
                    translateY.value = withSpring(EXPANDED_Y, SPRING_CONFIG);
                }
            } else {
                // We are currently collapsed
                if (translateY.value < COLLAPSED_Y - DRAG_THRESHOLD || event.velocityY < -500) {
                    translateY.value = withSpring(EXPANDED_Y, SPRING_CONFIG);
                    isExpandedShared.value = true;
                    runOnJS(setPlayerExpanded)(true);
                } else if (translateY.value > COLLAPSED_Y + 40 || event.velocityY > 500) {
                    // Swiped Down to stop/dismiss
                    runOnJS(dismissPlayer)();
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
        // Fade out smoothly over the first 50% of the expansion drag
        const opacity = interpolate(
            translateY.value,
            [COLLAPSED_Y - (SCREEN_HEIGHT * 0.5), COLLAPSED_Y],
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
