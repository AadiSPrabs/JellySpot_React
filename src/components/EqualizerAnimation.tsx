import React, { useEffect, useRef } from 'react';
import { View, Animated, StyleSheet, Easing } from 'react-native';
import { useIsAppActive } from '../hooks/useAppState';

interface EqualizerAnimationProps {
    color?: string;
    size?: number;
    isPlaying?: boolean;
}

export const EqualizerAnimation: React.FC<EqualizerAnimationProps> = ({
    color = '#D0BCFF',
    size = 20,
    isPlaying = true
}) => {
    const bar1 = useRef(new Animated.Value(0.4)).current;
    const bar2 = useRef(new Animated.Value(0.7)).current;
    const bar3 = useRef(new Animated.Value(0.5)).current;
    const bar4 = useRef(new Animated.Value(0.6)).current;
    const isAppActive = useIsAppActive();

    // Only animate when playing AND app is in foreground
    const shouldAnimate = isPlaying && isAppActive;

    useEffect(() => {
        if (!shouldAnimate) {
            // Stop at mid position when paused or app backgrounded
            Animated.parallel([
                Animated.timing(bar1, { toValue: 0.5, duration: 150, useNativeDriver: true }),
                Animated.timing(bar2, { toValue: 0.6, duration: 150, useNativeDriver: true }),
                Animated.timing(bar3, { toValue: 0.5, duration: 150, useNativeDriver: true }),
                Animated.timing(bar4, { toValue: 0.55, duration: 150, useNativeDriver: true }),
            ]).start();
            return;
        }

        const createAnimation = (bar: Animated.Value, minVal: number, maxVal: number, duration: number, delay: number = 0) => {
            return Animated.loop(
                Animated.sequence([
                    Animated.delay(delay),
                    Animated.timing(bar, {
                        toValue: maxVal,
                        duration: duration,
                        easing: Easing.inOut(Easing.sin),
                        useNativeDriver: true,
                    }),
                    Animated.timing(bar, {
                        toValue: minVal,
                        duration: duration,
                        easing: Easing.inOut(Easing.sin),
                        useNativeDriver: true,
                    }),
                ])
            );
        };

        const anim1 = createAnimation(bar1, 0.3, 1, 400, 0);
        const anim2 = createAnimation(bar2, 0.4, 0.95, 350, 50);
        const anim3 = createAnimation(bar3, 0.35, 1, 450, 100);
        const anim4 = createAnimation(bar4, 0.3, 0.9, 380, 75);

        anim1.start();
        anim2.start();
        anim3.start();
        anim4.start();

        return () => {
            anim1.stop();
            anim2.stop();
            anim3.stop();
            anim4.stop();
        };
    }, [shouldAnimate, bar1, bar2, bar3, bar4]);

    const barWidth = size / 5;
    const barHeight = size;
    const gap = size / 16;

    const renderBar = (animValue: Animated.Value) => (
        <Animated.View
            style={[
                styles.bar,
                {
                    width: barWidth,
                    height: barHeight,
                    marginHorizontal: gap,
                    backgroundColor: color,
                    transform: [{ scaleY: animValue }],
                },
            ]}
        />
    );

    return (
        <View style={[styles.container, { width: size, height: size }]}>
            {renderBar(bar1)}
            {renderBar(bar2)}
            {renderBar(bar3)}
            {renderBar(bar4)}
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flexDirection: 'row',
        alignItems: 'flex-end',
        justifyContent: 'center',
    },
    bar: {
        borderRadius: 2,
        transformOrigin: 'bottom',
    },
});
