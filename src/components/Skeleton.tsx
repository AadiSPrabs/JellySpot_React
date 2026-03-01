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

export const CardSkeleton = ({ width, isLandscape }: { width: number, isLandscape?: boolean }) => (
    <View style={[styles.card, { width, marginRight: 16, marginBottom: isLandscape ? 12 : 0 }]}>
        <Skeleton width={width} height={width} borderRadius={16} style={{ marginBottom: 8 }} />
        <Skeleton width="80%" height={16} />
    </View>
);

export const SearchSkeleton = () => (
    <View style={{ flex: 1 }}>
        {Array.from({ length: 10 }).map((_, i) => (
            <ListItemSkeleton key={i} />
        ))}
    </View>
);

export const HomeScreenSkeleton = ({ isLandscape, numColumns, width }: { isLandscape: boolean, numColumns: number, width: number }) => {
    // Approximating LEFT_BAR_WIDTH = 80 for landscape grid math matching HomeScreen.tsx
    const contentWidth = isLandscape ? width - 80 : width;
    const gridItemWidth = isLandscape ? (contentWidth - 40) / numColumns - 12 : 150;

    return (
        <View style={{ paddingTop: 20 }}>
            {/* Header Area */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, marginBottom: 16 }}>
                <View style={{ flex: 1 }}>
                    <Skeleton width={180} height={32} borderRadius={8} style={{ marginBottom: 8 }} />
                    {!isLandscape && <Skeleton width={120} height={16} borderRadius={4} />}
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Skeleton width={40} height={40} borderRadius={20} />
                </View>
            </View>

            {/* Source Switcher Area */}
            <View style={{ paddingHorizontal: 16, marginBottom: 32, alignItems: 'center' }}>
                <Skeleton width={200} height={40} borderRadius={20} />
            </View>

            {/* Sections */}
            {Array.from({ length: 3 }).map((_, sectionIndex) => (
                <View key={sectionIndex} style={{ marginBottom: 32 }}>
                    <Skeleton width={150} height={24} borderRadius={4} style={{ marginLeft: 20, marginBottom: 16 }} />
                    {isLandscape ? (
                        <View style={{ flexDirection: 'row', paddingHorizontal: 20, flexWrap: 'wrap' }}>
                            {Array.from({ length: numColumns }).map((_, i) => (
                                <CardSkeleton key={i} width={gridItemWidth} isLandscape={true} />
                            ))}
                        </View>
                    ) : (
                        <View style={{ flexDirection: 'row', paddingHorizontal: 20, overflow: 'hidden' }}>
                            {Array.from({ length: 3 }).map((_, i) => (
                                <CardSkeleton key={i} width={150} />
                            ))}
                        </View>
                    )}
                </View>
            ))}
        </View>
    );
};

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
        // No margin here, handled precisely in props now
        alignItems: 'center',
    },
});

