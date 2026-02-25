import React from 'react';
import { View, StyleSheet, useWindowDimensions } from 'react-native';
import { Dialog, Portal, Text, Button, useTheme, IconButton } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';

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
        <Portal>
            <Dialog
                visible={visible}
                onDismiss={onDismiss}
                style={[
                    styles.dialog,
                    isLandscape && styles.dialogLandscape,
                    { backgroundColor: theme.colors.elevation.level3 }
                ]}
            >
                <View style={[styles.header, isLandscape && styles.headerLandscape]}>
                    {showIcon && (
                        <MaterialCommunityIcons
                            name={ICONS[type] as any}
                            size={isLandscape ? 28 : 40}
                            color={getIconColor()}
                            style={styles.icon}
                        />
                    )}
                    <Text
                        variant={isLandscape ? "titleMedium" : "titleLarge"}
                        style={[styles.title, { color: theme.colors.onSurface }]}
                    >
                        {title}
                    </Text>
                </View>

                <Dialog.Content style={isLandscape && styles.contentLandscape}>
                    <Text
                        variant={isLandscape ? "bodySmall" : "bodyMedium"}
                        style={{ color: theme.colors.onSurfaceVariant }}
                    >
                        {message}
                    </Text>
                </Dialog.Content>

                <Dialog.Actions style={isLandscape && styles.actionsLandscape}>
                    <Button
                        mode="contained"
                        onPress={onDismiss}
                        style={[
                            { backgroundColor: getIconColor() },
                            isLandscape && styles.buttonLandscape
                        ]}
                        labelStyle={isLandscape && styles.buttonLabelLandscape}
                    >
                        {buttonText}
                    </Button>
                </Dialog.Actions>
            </Dialog>
        </Portal>
    );
}

const styles = StyleSheet.create({
    dialog: {
        borderRadius: 20,
        maxWidth: 400,
        alignSelf: 'center',
    },
    dialogLandscape: {
        maxWidth: 320,
        borderRadius: 16,
    },
    header: {
        alignItems: 'center',
        paddingTop: 24,
        paddingHorizontal: 24,
    },
    headerLandscape: {
        paddingTop: 16,
        paddingHorizontal: 16,
    },
    icon: {
        marginBottom: 12,
    },
    title: {
        fontWeight: 'bold',
        textAlign: 'center',
    },
    contentLandscape: {
        paddingVertical: 8,
        paddingHorizontal: 16,
    },
    actionsLandscape: {
        paddingVertical: 8,
        paddingHorizontal: 16,
    },
    buttonLandscape: {
        height: 36,
    },
    buttonLabelLandscape: {
        fontSize: 12,
        marginVertical: 6,
    },
});
