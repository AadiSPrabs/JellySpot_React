import React, { useRef, useEffect, useState } from 'react';
import { View, StyleSheet, ScrollView, Dimensions, Text, NativeSyntheticEvent, NativeScrollEvent } from 'react-native';
import { useTheme } from 'react-native-paper';
import * as Haptics from 'expo-haptics';

interface ScrollMeterProps {
    value: number; // in milliseconds
    onValueChange: (value: number) => void;
    rangeMs?: number; // e.g., 10000 for -10s to +10s
    msPerPixel?: number; // e.g., 10 for 10ms per pixel
}

const { width: screenWidth } = Dimensions.get('window');

const ScrollMeter = ({ value, onValueChange, rangeMs = 10000, msPerPixel = 10 }: ScrollMeterProps) => {
    const theme = useTheme();
    const scrollViewRef = useRef<ScrollView>(null);
    const [isInitialized, setIsInitialized] = useState(false);
    const [containerWidth, setContainerWidth] = useState(screenWidth);
    
    // Total number of pixels for one half of the range
    const halfWidth = rangeMs / msPerPixel;
    // Total width of the scrollable content
    const totalWidth = halfWidth * 2;
    // Tick interval in ms (e.g., a tick every 100ms)
    const tickIntervalMs = 100;
    const pixelsPerTick = tickIntervalMs / msPerPixel;
    const numTicks = (rangeMs * 2) / tickIntervalMs;

    const paddingHorizontal = containerWidth / 2;

    // Convert value to contentOffset.x
    const valueToScrollX = (val: number) => {
        // val is between -rangeMs and +rangeMs
        // If val = -rangeMs, x = 0
        // If val = 0, x = halfWidth
        // If val = +rangeMs, x = totalWidth
        return (val + rangeMs) / msPerPixel;
    };

    // Convert contentOffset.x to value
    const scrollXToValue = (x: number) => {
        return Math.round((x * msPerPixel) - rangeMs);
    };

    useEffect(() => {
        if (!isInitialized) return;
        // Only set initial position once
        const initialX = valueToScrollX(value);
        scrollViewRef.current?.scrollTo({ x: initialX, animated: false });
    }, [isInitialized]); // We don't depend on value to avoid jitter while scrolling

    const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
        if (!isInitialized) return;
        const x = event.nativeEvent.contentOffset.x;
        const newValue = scrollXToValue(x);
        
        // Clamp value
        const clampedValue = Math.max(-rangeMs, Math.min(rangeMs, newValue));
        onValueChange(clampedValue);
    };

    const ticks = Array.from({ length: numTicks + 1 }).map((_, i) => {
        const isMajor = i % 10 === 0; // Every 10th tick (1 second) is major
        const isZero = i === numTicks / 2;
        return (
            <View
                key={i}
                style={[
                    styles.tick,
                    { 
                        height: isZero ? 40 : (isMajor ? 30 : 15), 
                        backgroundColor: isZero ? theme.colors.primary : (isMajor ? theme.colors.onSurface : theme.colors.outline),
                        width: isZero ? 3 : (isMajor ? 2 : 1),
                        marginHorizontal: (pixelsPerTick - (isZero ? 3 : (isMajor ? 2 : 1))) / 2
                    }
                ]}
            />
        );
    });

    return (
        <View 
            style={styles.container} 
            onLayout={(e) => {
                setContainerWidth(e.nativeEvent.layout.width);
                if (!isInitialized) {
                    setIsInitialized(true);
                }
            }}
        >
            {/* Center Line Indicator */}
            <View style={[styles.centerLine, { backgroundColor: theme.colors.primary }]} />
            
            <ScrollView
                ref={scrollViewRef}
                horizontal
                showsHorizontalScrollIndicator={false}
                bounces={false}
                onScroll={handleScroll}
                scrollEventThrottle={16}
                contentContainerStyle={{
                    paddingHorizontal: paddingHorizontal,
                    alignItems: 'center',
                    justifyContent: 'center',
                    height: 60,
                }}
            >
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    {ticks}
                </View>
            </ScrollView>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        width: '100%',
        height: 80,
        justifyContent: 'center',
        position: 'relative',
    },
    tick: {
        borderRadius: 2,
    },
    centerLine: {
        position: 'absolute',
        top: 0,
        bottom: 0,
        left: '50%',
        width: 3,
        zIndex: 10,
        opacity: 0.5,
        transform: [{ translateX: -1.5 }],
    }
});

export default ScrollMeter;
