import React, { useEffect, useMemo } from 'react';
import { View, StyleSheet, useWindowDimensions } from 'react-native';
import { Canvas, Path, Skia, LinearGradient, vec, BlurMask } from '@shopify/react-native-skia';
import Animated, { 
    useSharedValue, 
    useAnimatedProps, 
    withRepeat, 
    withTiming, 
    Easing,
    useDerivedValue,
    interpolate
} from 'react-native-reanimated';
import { usePlayerStore } from '../store/playerStore';
import { useShallow } from 'zustand/react/shallow';

interface LiquidMiniProgressBarProps {
    color?: string;
    height?: number;
}

export const LiquidMiniProgressBar = ({ color = '#2196F3', height = 64 }: LiquidMiniProgressBarProps) => {
    const { positionMillis, durationMillis } = usePlayerStore(useShallow(state => ({
        positionMillis: state.positionMillis,
        durationMillis: state.durationMillis
    })));
    
    const { width: SCREEN_WIDTH } = useWindowDimensions();
    // Account for margins in MiniPlayer (12px each side)
    const containerWidth = SCREEN_WIDTH - 24;
    
    const progress = useDerivedValue(() => {
        if (durationMillis <= 0) return 0;
        return positionMillis / durationMillis;
    });

    const waveOffset = useSharedValue(0);

    useEffect(() => {
        waveOffset.value = withRepeat(
            withTiming(2 * Math.PI, { duration: 2000, easing: Easing.linear }),
            -1,
            false
        );
    }, []);

    const path = useDerivedValue(() => {
        const p = Skia.Path.Make();
        const currentWidth = progress.value * containerWidth;
        const waveHeight = 5;
        const waveFrequency = 0.04;
        
        // Start at top-left
        p.moveTo(0, 0);
        
        // Draw wavy line on the right edge (from top to bottom)
        // We add a bit of padding to the width so the wave doesn't clip
        for (let y = 0; y <= height; y += 1) {
            const xOffset = Math.sin(y * waveFrequency + waveOffset.value) * waveHeight;
            p.lineTo(currentWidth + xOffset, y);
        }
        
        // Bottom edge back to left
        p.lineTo(0, height);
        p.close();
        
        return p;
    });

    return (
        <View style={[styles.container, { height }]}>
            <Canvas style={{ flex: 1 }}>
                {/* Glow Layer */}
                <Path path={path}>
                    <BlurMask blur={10} style="normal" />
                    <LinearGradient
                        start={vec(0, 0)}
                        end={vec(containerWidth, 0)}
                        colors={[color + '20', color + '40']}
                    />
                </Path>
                
                {/* Main Liquid Layer */}
                <Path path={path}>
                    <LinearGradient
                        start={vec(0, 0)}
                        end={vec(containerWidth, 0)}
                        colors={[color + '30', color + '50']}
                    />
                </Path>
            </Canvas>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 0,
    }
});
