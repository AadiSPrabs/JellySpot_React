import React, { useRef } from 'react';
import { View, Animated, Pressable, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { Text, IconButton, useTheme, Surface, Checkbox } from 'react-native-paper';
import { jellyfinApi } from '../api/jellyfin';
import { EqualizerAnimation } from './EqualizerAnimation';
import { MaterialCommunityIcons as Icon } from '@expo/vector-icons';

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
    drag?: () => void;
    isActive?: boolean;
}

const SongItemComponent = ({
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
    drag,
    isActive = false,
}: SongItemProps) => {
    const theme = useTheme();


    // Use provided getImageUrl or fallback to jellyfinApi or item.ImageUrl
    const imageUri = getImageUrl
        ? getImageUrl(item)
        : (item.ImageUrl || jellyfinApi.getImageUrl(item.Id || item.id));

    const artistName = item.Artists?.[0] || item.AlbumArtist || item.artist || 'Unknown Artist';
    const trackName = item.Name || item.title || item.name || 'Unknown Track';

    return (
        <View>
            <Pressable
                onPress={isSelectionMode ? onLongPress : onPress} // In selection mode, tap toggles selection (same as long press logic usually)
                onLongPress={onLongPress}
                style={({ pressed }) => [
                    styles.container,
                    {
                        backgroundColor: isActive
                            ? theme.colors.elevation.level3
                            : isSelected
                                ? theme.colors.primaryContainer
                                : (isCurrent && !showEqualizer ? theme.colors.elevation.level5 : 'transparent'),
                    },
                    pressed && !isSelected && !isActive && { backgroundColor: theme.colors.elevation.level2 }
                ]}
                android_ripple={{ color: theme.colors.onSurfaceVariant, borderless: false }}
                accessibilityRole="button"
                accessibilityLabel={`${trackName} by ${artistName}${isSelected ? ', selected' : ''}${isCurrent ? ', currently playing' : ''}`}
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

                    {/* Menu Button or Drag Handle */}
                    {!isSelectionMode && (
                        drag ? (
                            <Pressable onPressIn={drag} style={{ padding: 8 }}>
                                <Icon name="drag" size={24} color={theme.colors.onSurfaceVariant} />
                            </Pressable>
                        ) : (
                            <IconButton
                                icon="dots-vertical"
                                size={24}
                                onPress={onMenuPress}
                                accessibilityLabel={`Options for ${trackName}`}
                            />
                        )
                    )}
                </View>
            </Pressable>
        </View>
    );
};

// Custom comparator to prevent massive re-renders when parent's inline functions change
const areEqual = (prevProps: SongItemProps, nextProps: SongItemProps) => {
    // Compare primitive values
    if (prevProps.isCurrent !== nextProps.isCurrent) return false;
    if (prevProps.isPlaying !== nextProps.isPlaying) return false;
    if (prevProps.isSelectionMode !== nextProps.isSelectionMode) return false;
    if (prevProps.isSelected !== nextProps.isSelected) return false;
    if (prevProps.isActive !== nextProps.isActive) return false;
    if (prevProps.showEqualizer !== nextProps.showEqualizer) return false;
    if (prevProps.index !== nextProps.index) return false;

    // Compare item identifiers (handle both Jellyfin 'Id' and internal 'id')
    const prevId = prevProps.item?.Id || prevProps.item?.id;
    const nextId = nextProps.item?.Id || nextProps.item?.id;
    if (prevId !== nextId) return false;

    // Deep check not needed for performance reasons; if you edit metadata 
    // it might not reflect instantly, but preventing 600ms freezes is priority #1.
    return true;
};

export const SongItem = React.memo(SongItemComponent, areEqual);

const styles = StyleSheet.create({
    container: {
        borderRadius: 8,
        marginHorizontal: 4,
        marginVertical: 1,
        overflow: 'hidden'
    },
    contentRow: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 6,
        minHeight: 64,
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
