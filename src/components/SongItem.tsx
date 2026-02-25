import React, { useRef } from 'react';
import { View, Image, Animated, Pressable, StyleSheet } from 'react-native';
import { Text, IconButton, useTheme, Surface, Checkbox } from 'react-native-paper';
import { jellyfinApi } from '../api/jellyfin';
import { EqualizerAnimation } from './EqualizerAnimation';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

interface SongItemProps {
    item: any;
    index?: number;
    isCurrent: boolean;
    isPlaying: boolean;
    onPress: () => void;
    onLongPress?: () => void;
    onMenuPress: () => void; // Converted to simple void for generic usage, parent handles ID binding
    getImageUrl?: (item: any) => string | undefined;
    isSelectionMode?: boolean;
    isSelected?: boolean;
    showEqualizer?: boolean; // New prop to enable equalizer (for DetailScreen)
}

export const SongItem = React.memo(({
    item,
    index,
    isCurrent,
    isPlaying,
    onPress,
    onLongPress,
    onMenuPress,
    getImageUrl,
    isSelectionMode = false,
    isSelected = false,
    showEqualizer = false,
}: SongItemProps) => {
    const theme = useTheme();
    const scaleAnim = useRef(new Animated.Value(1)).current;

    // Use provided getImageUrl or fallback to jellyfinApi or item.ImageUrl
    const imageUri = getImageUrl
        ? getImageUrl(item)
        : (item.ImageUrl || jellyfinApi.getImageUrl(item.Id || item.id));

    const artistName = item.Artists?.[0] || item.AlbumArtist || item.artist || 'Unknown Artist';
    const trackName = item.Name || item.title || item.name || 'Unknown Track';

    const handlePressIn = () => {
        Animated.spring(scaleAnim, {
            toValue: 0.97,
            useNativeDriver: true,
            speed: 50,
            bounciness: 0,
        }).start();
    };

    const handlePressOut = () => {
        Animated.spring(scaleAnim, {
            toValue: 1,
            useNativeDriver: true,
            speed: 50,
            bounciness: 4,
        }).start();
    };

    return (
        <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
            <Pressable
                onPress={isSelectionMode ? onLongPress : onPress} // In selection mode, tap toggles selection (same as long press logic usually)
                onLongPress={onLongPress}
                onPressIn={handlePressIn}
                onPressOut={handlePressOut}
                style={({ pressed }) => [
                    styles.container,
                    {
                        backgroundColor: isSelected
                            ? theme.colors.primaryContainer
                            : (isCurrent && !showEqualizer ? theme.colors.elevation.level5 : 'transparent'),
                    },
                    pressed && !isSelected && { backgroundColor: theme.colors.elevation.level2 }
                ]}
                android_ripple={{ color: theme.colors.onSurfaceVariant, borderless: false }}
            >
                <View style={styles.contentRow}>
                    {/* Selection Checkbox */}
                    {isSelectionMode && (
                        <View style={{ marginRight: 12 }}>
                            <Icon
                                name={isSelected ? "checkbox-marked-circle" : "checkbox-blank-circle-outline"}
                                size={24}
                                color={isSelected ? theme.colors.primary : theme.colors.onSurfaceVariant}
                            />
                        </View>
                    )}

                    {/* Artwork & Equalizer */}
                    <View style={styles.artworkContainer}>
                        {imageUri ? (
                            <Image
                                source={{ uri: imageUri }}
                                style={[styles.artwork, { backgroundColor: theme.colors.surfaceVariant }]}
                            />
                        ) : (
                            <Surface style={[styles.artwork, { backgroundColor: theme.colors.surfaceVariant, alignItems: 'center', justifyContent: 'center' }]}>
                                <Icon name="music-note" size={24} color={theme.colors.onSurfaceVariant} />
                            </Surface>
                        )}

                        {/* DetailScreen style Equalizer Overlay */}
                        {showEqualizer && isCurrent && (
                            <View style={styles.equalizerOverlay}>
                                <EqualizerAnimation color={theme.colors.primary} size={20} isPlaying={isPlaying} />
                            </View>
                        )}
                    </View>

                    {/* Text Info */}
                    <View style={styles.textContainer}>
                        <Text
                            variant="bodyLarge"
                            numberOfLines={1}
                            style={{
                                color: (isCurrent || isSelected) ? theme.colors.primary : theme.colors.onSurface,
                                fontWeight: (isCurrent || isSelected) ? 'bold' : 'normal'
                            }}
                        >
                            {trackName}
                        </Text>
                        <Text variant="bodyMedium" numberOfLines={1} style={{ color: theme.colors.onSurfaceVariant }}>
                            {artistName}
                        </Text>
                    </View>

                    {/* Menu Button (Hidden in selection mode) */}
                    {!isSelectionMode && (
                        <IconButton
                            icon="dots-vertical"
                            size={24}
                            onPress={onMenuPress}
                        />
                    )}
                </View>
            </Pressable>
        </Animated.View>
    );
});

const styles = StyleSheet.create({
    container: {
        borderRadius: 8,
        marginHorizontal: 8,
        marginVertical: 2,
        overflow: 'hidden'
    },
    contentRow: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 8,
        minHeight: 72,
    },
    artworkContainer: {
        position: 'relative',
        marginRight: 12,
    },
    artwork: {
        width: 48,
        height: 48,
        borderRadius: 8,
    },
    equalizerOverlay: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: 'rgba(0,0,0,0.5)',
        borderRadius: 8,
    },
    textContainer: {
        flex: 1,
        justifyContent: 'center',
    }
});
