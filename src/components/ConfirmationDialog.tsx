import React from 'react';
import { View, StyleSheet, useWindowDimensions } from 'react-native';
import { Text, Button, useTheme } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import ActionSheet from './ActionSheet';

export type ConfirmationType = 'success' | 'error' | 'warning' | 'info';

interface ConfirmationDialogProps {
    visible: boolean;
    onDismiss: () => void;
    title: string;
    message: string;
    type?: ConfirmationType;
    buttonText?: string;
    showIcon?: boolean;
}

const ICONS: Record<ConfirmationType, string> = {
    success: 'check-circle',
    error: 'alert-circle',
    warning: 'alert',
    info: 'information',
};

export default function ConfirmationDialog({
    visible,
    onDismiss,
    title,
    message,
    type = 'info',
    buttonText = 'OK',
    showIcon = true,
}: ConfirmationDialogProps) {
    const theme = useTheme();
    const { width, height } = useWindowDimensions();
    const isLandscape = width > height;

    const getIconColor = () => {
        switch (type) {
            case 'success':
                return '#4CAF50';
            case 'error':
                return theme.colors.error;
            case 'warning':
                return '#FF9800';
            case 'info':
            default:
                return theme.colors.primary;
        }
    };

    return (
        <ActionSheet visible={visible} onClose={onDismiss} title={title} heightPercentage={35}>
            <View style={{ gap: 16, alignItems: 'center', paddingVertical: 8 }}>
                {showIcon && (
                    <MaterialCommunityIcons
                        name={ICONS[type] as any}
                        size={64}
                        color={getIconColor()}
                        style={styles.icon}
                    />
                )}
                <Text variant="bodyLarge" style={{ textAlign: 'center', color: theme.colors.onSurfaceVariant, paddingHorizontal: 16 }}>
                    {message}
                </Text>

                <Button
                    mode="contained"
                    onPress={onDismiss}
                    style={{ backgroundColor: getIconColor(), width: '80%', marginTop: 8 }}
                >
                    {buttonText}
                </Button>
            </View>
        </ActionSheet>
    );
}

const styles = StyleSheet.create({
    icon: {
        marginBottom: 8,
    }
});
