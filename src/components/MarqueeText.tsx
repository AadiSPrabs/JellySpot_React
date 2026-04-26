import React, { useEffect, useRef, useState } from 'react';
import { View, Animated, LayoutChangeEvent, StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';

interface MarqueeTextProps {
    text: string;
    style?: any;
    variant?: any;
    speed?: number; // pixels per second
    pauseDuration?: number; // ms to pause at each end before scrolling
}

export default function MarqueeText({
    text,
    style,
    variant = 'headlineSmall',
    speed = 30,
    pauseDuration = 2000,
}: MarqueeTextProps) {
    const [containerWidth, setContainerWidth] = useState(0);
    const [textWidth, setTextWidth] = useState(0);
    const translateX = useRef(new Animated.Value(0)).current;
    const animationRef = useRef<Animated.CompositeAnimation | null>(null);

    const overflow = textWidth - containerWidth;
    const shouldScroll = overflow > 5 && containerWidth > 0; // 5px threshold to avoid jitter

    // Restart animation whenever text or measurements change
    useEffect(() => {
        if (animationRef.current) {
            animationRef.current.stop();
            animationRef.current = null;
        }
        translateX.setValue(0);

        if (!shouldScroll) return;

        const scrollDuration = (overflow / speed) * 1000;

        const loop = Animated.loop(
            Animated.sequence([
                // Pause at start position
                Animated.delay(pauseDuration),
                // Scroll left to reveal end of text
                Animated.timing(translateX, {
                    toValue: -overflow,
                    duration: scrollDuration,
                    useNativeDriver: true,
                }),
                // Pause at end position
                Animated.delay(pauseDuration),
                // Scroll back to start
                Animated.timing(translateX, {
                    toValue: 0,
                    duration: scrollDuration,
                    useNativeDriver: true,
                }),
            ]),
        );

        animationRef.current = loop;
        loop.start();

        return () => {
            loop.stop();
            animationRef.current = null;
        };
    }, [text, shouldScroll, overflow, speed, pauseDuration]);

    const onContainerLayout = (e: LayoutChangeEvent) => {
        setContainerWidth(e.nativeEvent.layout.width);
    };

    const onTextLayout = (e: any) => {
        // react-native-paper Text fires onTextLayout with lines array
        if (e?.nativeEvent?.lines?.length > 0) {
            const measuredWidth = e.nativeEvent.lines[0].width;
            setTextWidth(measuredWidth);
        }
    };

    return (
        <View onLayout={onContainerLayout} style={styles.container}>
            <Animated.View
                style={[
                    styles.textWrapper,
                    { transform: [{ translateX }] },
                ]}
            >
                <Text
                    variant={variant}
                    style={[style, styles.text]}
                    numberOfLines={1}
                    onTextLayout={onTextLayout}
                >
                    {text}
                </Text>
            </Animated.View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        overflow: 'hidden',
        width: '100%',
    },
    textWrapper: {
        flexDirection: 'row',
    },
    text: {
        // Prevent wrapping — let the text extend beyond the container
        // The container clips it with overflow: hidden
    },
});
