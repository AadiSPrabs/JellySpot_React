import React, { useEffect, useRef } from 'react';
import { StyleSheet, View, Animated, ViewStyle, DimensionValue } from 'react-native';
import { useTheme } from 'react-native-paper';

interface SkeletonProps {
    width?: DimensionValue;
    height?: DimensionValue;
    style?: ViewStyle;
    borderRadius?: number;
}

export const Skeleton = ({ width, height, style, borderRadius = 4 }: SkeletonProps) => {
    const theme = useTheme();
    const opacity = useRef(new Animated.Value(0.3)).current;

    useEffect(() => {
        const animation = Animated.loop(
            Animated.sequence([
                Animated.timing(opacity, {
                    toValue: 0.7,
                    duration: 800,
                    useNativeDriver: true,
                }),
                Animated.timing(opacity, {
                    toValue: 0.3,
                    duration: 800,
                    useNativeDriver: true,
                }),
            ])
        );
        animation.start();

        return () => animation.stop();
    }, []);

    return (
        <Animated.View
            style={[
                {
                    width,
                    height,
                    backgroundColor: theme.colors.surfaceVariant,
                    opacity,
                    borderRadius,
                },
                style,
            ]}
        />
    );
};

export const ListItemSkeleton = () => (
    <View style={styles.listItem}>
        <Skeleton width={48} height={48} borderRadius={8} />
        <View style={styles.textContainer}>
            <Skeleton width="60%" height={16} style={{ marginBottom: 6 }} />
            <Skeleton width="40%" height={12} />
        </View>
    </View>
);

export const CardSkeleton = ({ width }: { width: number }) => (
    <View style={[styles.card, { width }]}>
        <Skeleton width={width} height={width} borderRadius={12} style={{ marginBottom: 8 }} />
        <Skeleton width="80%" height={16} />
    </View>
);

const styles = StyleSheet.create({
    listItem: {
        flexDirection: 'row',
        padding: 16,
        alignItems: 'center',
    },
    textContainer: {
        marginLeft: 16,
        flex: 1,
    },
    card: {
        margin: 8,
        alignItems: 'center',
    },
});
