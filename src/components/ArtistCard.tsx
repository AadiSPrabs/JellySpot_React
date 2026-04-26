import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { Text, useTheme } from 'react-native-paper';
import { MediaItem } from '../types/media';
import ImageWithFallback from './ImageWithFallback';

interface ArtistCardProps {
    item: MediaItem;
    imageUrl: string | null;
    onPress: (item: MediaItem) => void;
}

const ArtistCard = React.memo(({ item, imageUrl, onPress }: ArtistCardProps) => {
    const theme = useTheme();
    const artistItemSize = 160;

    return (
        <TouchableOpacity style={{ marginRight: 16, alignItems: 'center', width: artistItemSize }} onPress={() => onPress(item)}>
            <View style={{ width: artistItemSize, height: artistItemSize, borderRadius: 16, overflow: 'hidden' }}>
                <ImageWithFallback
                    uri={imageUrl}
                    style={{ width: artistItemSize, height: artistItemSize, borderRadius: 16 }}
                    fallbackIcon="account-music"
                    iconSize={56}
                    iconColor={theme.colors.onSurfaceVariant}
                    backgroundColor={theme.colors.surfaceVariant}
                    borderRadius={16}
                />
                <View style={styles.overlay}>
                    <Text variant="labelLarge" numberOfLines={1} style={styles.overlayText}>{item.Name}</Text>
                </View>
            </View>
        </TouchableOpacity>
    );
}, (prevProps, nextProps) => {
    return (
        prevProps.item.Id === nextProps.item.Id &&
        prevProps.imageUrl === nextProps.imageUrl
    );
});

const styles = StyleSheet.create({
    overlay: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        paddingVertical: 8,
        paddingHorizontal: 8,
        backgroundColor: 'rgba(0,0,0,0.6)',
    },
    overlayText: {
        color: '#fff',
        textAlign: 'center',
        fontWeight: '600',
    },
});

export default ArtistCard;
