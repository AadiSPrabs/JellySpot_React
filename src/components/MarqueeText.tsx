import React, { useEffect, useRef, useState } from 'react';
import { View, Animated, Easing, LayoutChangeEvent, StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';

interface MarqueeTextProps {
    text: string;
    style?: any;
    variant?: any;
}

export default function MarqueeText({
    text,
    style,
    variant = 'headlineSmall',
}: MarqueeTextProps) {
    const translateX = useRef(new Animated.Value(0)).current;
    const animRef = useRef<Animated.CompositeAnimation | null>(null);
    const [cw, setCw] = useState(0);
    const [tw, setTw] = useState(0);

    const overflow = tw - cw;
    const shouldScroll = overflow > 5 && cw > 0;

    useEffect(() => {
        if (animRef.current) {
            animRef.current.stop();
            animRef.current = null;
        }
        translateX.setValue(0);

        if (!shouldScroll) return;

        const duration = overflow * 25;

        const loop = Animated.loop(
            Animated.sequence([
                Animated.delay(1500),
                Animated.timing(translateX, {
                    toValue: -overflow,
                    duration,
                    useNativeDriver: false,
                    easing: Easing.linear,
                }),
                Animated.delay(1500),
                Animated.timing(translateX, {
                    toValue: 0,
                    duration,
                    useNativeDriver: false,
                    easing: Easing.linear,
                }),
            ]),
        );

        animRef.current = loop;
        loop.start();

        return () => {
            loop.stop();
            animRef.current = null;
        };
    }, [shouldScroll, overflow]);

    const onContainerLayout = (e: LayoutChangeEvent) => {
        setCw(e.nativeEvent.layout.width);
    };

    const onTextLayout = (e: any) => {
        if (e.nativeEvent.lines?.length > 0) {
            setTw(e.nativeEvent.lines[0].width);
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
                <View style={styles.spacer}>
                    <Text
                        variant={variant}
                        style={style}
                        onTextLayout={onTextLayout}
                    >
                        {text}
                    </Text>
                </View>
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
    spacer: {
        width: 9999,
    },
});
