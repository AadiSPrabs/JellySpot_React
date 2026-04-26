import React from 'react';
import { StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { Card, Text, useTheme } from 'react-native-paper';
import { MediaItem } from '../types/media';
import ImageWithFallback from './ImageWithFallback';

interface MediaCardProps {
    item: MediaItem;
    imageUrl: string | null;
    onPress: (item: MediaItem) => void;
    style?: StyleProp<ViewStyle>;
    imageStyle?: StyleProp<ViewStyle>;
    iconSize?: number;
}

const MediaCard = React.memo(({ item, imageUrl, onPress, style, imageStyle, iconSize = 50 }: MediaCardProps) => {
    const theme = useTheme();

    return (
        <Card
            style={[styles.card, style]}
            onPress={() => onPress(item)}
            mode="contained"
        >
            <ImageWithFallback
                uri={imageUrl}
                style={[styles.cardImage, imageStyle]}
                fallbackIcon="music-note"
                iconSize={iconSize}
                iconColor={theme.colors.onSurfaceVariant}
                backgroundColor={theme.colors.surfaceVariant}
                borderRadius={16}
            />
            {item.Name ? (
                <Card.Content style={styles.cardContent}>
                    <Text variant="titleSmall" numberOfLines={1}>{item.Name}</Text>
                </Card.Content>
            ) : null}
        </Card>
    );
}, (prevProps, nextProps) => {
    return (
        prevProps.item.Id === nextProps.item.Id &&
        prevProps.imageUrl === nextProps.imageUrl &&
        prevProps.iconSize === nextProps.iconSize
    );
});

const styles = StyleSheet.create({
    card: {
        width: 150,
        height: 150,
        borderRadius: 16,
        overflow: 'hidden',
        backgroundColor: 'transparent',
    },
    cardImage: {
        width: 150,
        height: 150,
        borderRadius: 16,
    },
    cardContent: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        paddingHorizontal: 8,
        paddingVertical: 12,
        backgroundColor: 'rgba(0,0,0,0.4)',
    },
});

export default MediaCard;
