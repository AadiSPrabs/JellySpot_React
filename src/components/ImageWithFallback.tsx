import React from 'react';
import { View } from 'react-native';
import { Image } from 'expo-image';
import { MaterialCommunityIcons as Icon } from '@expo/vector-icons';

interface ImageWithFallbackProps {
    uri: string | null | undefined;
    style: any;
    fallbackIcon?: string;
    iconSize?: number;
    iconColor: string;
    backgroundColor: string;
    borderRadius?: number;
}

const ImageWithFallback = ({
    uri,
    style,
    fallbackIcon = 'music-note',
    iconSize = 40,
    iconColor,
    backgroundColor,
    borderRadius = 0
}: ImageWithFallbackProps) => {
    const [hasError, setHasError] = React.useState(false);
    const [isLoading, setIsLoading] = React.useState(true);

    if (!uri || hasError) {
        return (
            <View style={[style, { backgroundColor, justifyContent: 'center', alignItems: 'center', borderRadius, overflow: 'hidden' }]}>
                <Icon name={fallbackIcon as any} size={iconSize} color={iconColor} />
            </View>
        );
    }

    return (
        <View style={[style, { borderRadius, overflow: 'hidden' }]}>
            <Image
                source={{ uri }}
                style={[style, { position: 'absolute', borderRadius }]}
                onError={() => setHasError(true)}
                onLoad={() => setIsLoading(false)}
            />
            {isLoading && (
                <View style={[style, { backgroundColor, justifyContent: 'center', alignItems: 'center', position: 'absolute', borderRadius }]}>
                    <Icon name={fallbackIcon as any} size={iconSize} color={iconColor} />
                </View>
            )}
        </View>
    );
};

export default ImageWithFallback;
