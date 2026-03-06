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

/** Skeleton matching the SongItem layout (image + title + artist + menu icon) */
export const SongItemSkeleton = () => (
    <View style={styles.songItem}>
        <Skeleton width={56} height={56} borderRadius={8} />
        <View style={[styles.textContainer, { marginLeft: 12 }]}>
            <Skeleton width="65%" height={15} style={{ marginBottom: 6 }} />
            <Skeleton width="45%" height={12} />
        </View>
        <Skeleton width={24} height={24} borderRadius={12} style={{ marginLeft: 8 }} />
    </View>
);

/** Skeleton matching the artist circle layout */
export const ArtistSkeleton = () => (
    <View style={styles.artistSkeleton}>
        <Skeleton width={100} height={100} borderRadius={50} />
        <Skeleton width={70} height={14} borderRadius={4} style={{ marginTop: 12 }} />
    </View>
);

export const SearchSkeleton = () => (
    <View style={{ flex: 1 }}>
        {Array.from({ length: 10 }).map((_, i) => (
            <ListItemSkeleton key={i} />
        ))}
    </View>
);

/**
 * Content-only skeleton for the HomeScreen.
 * Does NOT include header or source switcher — those stay visible during loading.
 * Mirrors the actual content sections: horizontal card rows, song list items, artist circles.
 */
export const HomeScreenContentSkeleton = ({ isLandscape, numColumns, width }: { isLandscape: boolean, numColumns: number, width: number }) => {
    // Approximating LEFT_BAR_WIDTH = 80 for landscape grid math matching HomeScreen.tsx
    const contentWidth = isLandscape ? width - 80 : width;
    const gridItemWidth = isLandscape ? (contentWidth - 40) / numColumns - 12 : 150;

    return (
        <View style={{ paddingTop: 8 }}>
            {/* Section 1: Horizontal card row (e.g. Jump Back In / Recently Added) */}
            <View style={{ marginBottom: 32 }}>
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

            {/* Section 2: Artist circles row */}
            <View style={{ marginBottom: 32 }}>
                <Skeleton width={130} height={24} borderRadius={4} style={{ marginLeft: 20, marginBottom: 16 }} />
                <View style={{ flexDirection: 'row', paddingHorizontal: 20, overflow: 'hidden' }}>
                    {Array.from({ length: isLandscape ? 5 : 3 }).map((_, i) => (
                        <ArtistSkeleton key={i} />
                    ))}
                </View>
            </View>

            {/* Section 3: Song list items (e.g. Quick Picks / Most Played) */}
            <View style={{ marginBottom: 32 }}>
                <Skeleton width={120} height={24} borderRadius={4} style={{ marginLeft: 20, marginBottom: 16 }} />
                {isLandscape ? (
                    <View style={{ flexDirection: 'row', paddingHorizontal: 20, flexWrap: 'wrap' }}>
                        {Array.from({ length: numColumns }).map((_, i) => (
                            <CardSkeleton key={i} width={gridItemWidth} isLandscape={true} />
                        ))}
                    </View>
                ) : (
                    <View style={{ paddingHorizontal: 12 }}>
                        {Array.from({ length: 5 }).map((_, i) => (
                            <SongItemSkeleton key={i} />
                        ))}
                    </View>
                )}
            </View>

            {/* Section 4: Another horizontal card row (e.g. Fresh Arrivals) */}
            <View style={{ marginBottom: 32 }}>
                <Skeleton width={140} height={24} borderRadius={4} style={{ marginLeft: 20, marginBottom: 16 }} />
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
        </View>
    );
};

/** @deprecated Use HomeScreenContentSkeleton instead */
export const HomeScreenSkeleton = HomeScreenContentSkeleton;

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
    songItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 8,
        paddingHorizontal: 8,
    },
    artistSkeleton: {
        marginRight: 20,
        alignItems: 'center',
        width: 100,
    },
});

