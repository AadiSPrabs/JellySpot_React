import React, { useEffect, useRef, useState } from 'react';
import { View, StyleSheet, LayoutChangeEvent, Animated, Easing } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useTheme } from 'react-native-paper';

interface WavyProgressBarProps {
    progress: number; // 0 to 1
    isPlaying: boolean;
    color?: string;
    trackColor?: string;
    height?: number;
}

export const WavyProgressBar: React.FC<WavyProgressBarProps> = ({
    progress,
    isPlaying,
    color,
    trackColor,
    height = 10
}) => {
    const theme = useTheme();
    const activeColor = color || theme.colors.primary;
    const inactiveColor = trackColor || theme.colors.surfaceVariant;

    const [width, setWidth] = useState(0);
    const phase = useRef(new Animated.Value(0)).current;

    const onLayout = (e: LayoutChangeEvent) => {
        setWidth(e.nativeEvent.layout.width);
    };

    useEffect(() => {
        let animation: Animated.CompositeAnimation;

        if (isPlaying) {
            // Reset value to avoid jumps if restarting? 
            // Actually better to just loop from 0 to -20 continuously
            phase.setValue(0);
            animation = Animated.loop(
                Animated.timing(phase, {
                    toValue: -20,
                    duration: 1000,
                    easing: Easing.linear,
                    useNativeDriver: true,
                })
            );
            animation.start();
        } else {
            phase.stopAnimation();
        }

        return () => {
            if (animation) {
                animation.stop();
            }
        };
    }, [isPlaying]);

    // Generate wave path
    // We need a path that is wider than the screen to allow for animation
    // Wave length = 20, Amplitude = height / 2
    const generateWavePath = (w: number, h: number) => {
        let path = `M 0 ${h / 2}`;
        const waveLength = 20;
        const amplitude = h / 4;

        // Generate enough waves to cover width + extra for animation
        for (let x = 0; x <= w + waveLength; x += 1) {
            const y = (h / 2) + amplitude * Math.sin((x * 2 * Math.PI) / waveLength);
            path += ` L ${x} ${y}`;
        }
        return path;
    };

    const wavePath = React.useMemo(() => {
        if (width === 0) return "";
        return generateWavePath(width, height);
    }, [width, height]);

    return (
        <View style={[styles.container, { height }]} onLayout={onLayout}>
            {/* Background Track (Straight Line) */}
            <View style={[styles.track, { backgroundColor: inactiveColor, height: 4, top: (height - 4) / 2 }]} />

            {/* Progress Mask Container */}
            <View style={[styles.progressContainer, { width: `${progress * 100}%` }]}>
                {/* Animated Wavy Line */}
                {width > 0 && (
                    <Animated.View style={[styles.waveContainer, { transform: [{ translateX: phase }] }]}>
                        <Svg width={width + 20} height={height}>
                            <Path
                                d={wavePath}
                                stroke={activeColor}
                                strokeWidth={4}
                                fill="none"
                                strokeLinecap="round"
                            />
                        </Svg>
                    </Animated.View>
                )}
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        width: '100%',
        justifyContent: 'center',
    },
    track: {
        width: '100%',
        position: 'absolute',
        borderRadius: 2,
    },
    progressContainer: {
        height: '100%',
        overflow: 'hidden',
        position: 'relative',
    },
    waveContainer: {
        position: 'absolute',
        top: 0,
        left: 0,
    }
});
