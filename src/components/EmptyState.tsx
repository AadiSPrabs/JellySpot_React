import React from 'react';
import { View, StyleSheet, StyleProp, ViewStyle, Text as RNText } from 'react-native';
import { Text, useTheme, Button } from 'react-native-paper';
import { MaterialCommunityIcons as Icon } from '@expo/vector-icons';

interface EmptyStateProps {
    icon: string;
    title: string;
    description?: string;
    actionLabel?: string;
    onAction?: () => void;
    style?: StyleProp<ViewStyle>;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
    icon,
    title,
    description,
    actionLabel,
    onAction,
    style,
}) => {
    const theme = useTheme();

    return (
        <View style={[styles.container, style]}>
            <Icon name={icon as any} size={64} color={theme.colors.onSurfaceVariant} style={{ opacity: 0.5, marginBottom: 24 }} />
            <Text variant="titleLarge" style={[styles.title, { color: theme.colors.onSurface }]}>
                {title}
            </Text>
            {description && (
                <Text variant="bodyMedium" style={[styles.description, { color: theme.colors.onSurfaceVariant }]}>
                    {description}
                </Text>
            )}
            {actionLabel && onAction && (
                <Button
                    mode="contained-tonal"
                    onPress={onAction}
                    style={styles.actionButton}
                >
                    {actionLabel}
                </Button>
            )}
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 40,
    },
    title: {
        fontWeight: 'bold',
        textAlign: 'center',
        marginBottom: 8,
    },
    description: {
        textAlign: 'center',
        marginBottom: 24,
        paddingHorizontal: 20,
    },
    actionButton: {
        marginTop: 8,
    },
});
