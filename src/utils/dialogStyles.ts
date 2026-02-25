import { StyleSheet, useWindowDimensions } from 'react-native';

// Reusable dialog styles for landscape-responsive dialogs
export const dialogStyles = StyleSheet.create({
    // Base dialog styling
    dialog: {
        borderRadius: 16,
        width: '85%',
        maxWidth: 400,
        minWidth: 280,
        alignSelf: 'center',
    },
    // Compact landscape variant
    dialogLandscape: {
        width: '80%',
        maxWidth: 320,
        minWidth: 240,
        borderRadius: 12,
    },
    // Even more compact for very small dialogs
    dialogCompactLandscape: {
        maxWidth: 280,
        borderRadius: 10,
    },
    // Title styling
    title: {
        paddingBottom: 8,
    },
    titleLandscape: {
        paddingBottom: 4,
        fontSize: 16,
    },
    // Content styling
    content: {
        paddingBottom: 16,
    },
    contentLandscape: {
        paddingVertical: 8,
        paddingHorizontal: 16,
    },
    // Actions styling
    actions: {
        paddingTop: 8,
    },
    actionsLandscape: {
        paddingVertical: 6,
        paddingHorizontal: 12,
    },
    // List items in dialogs
    listItem: {
        paddingVertical: 8,
    },
    listItemLandscape: {
        paddingVertical: 4,
        minHeight: 40,
    },
    // Button styling
    button: {
        minWidth: 80,
    },
    buttonLandscape: {
        minWidth: 60,
        height: 36,
    },
    buttonLabelLandscape: {
        fontSize: 12,
        marginVertical: 6,
    },
});

// Hook to get landscape-aware dialog styles
export function useLandscapeDialogStyles() {
    const { width, height } = useWindowDimensions();
    const isLandscape = width > height;

    return {
        isLandscape,
        dialogStyle: isLandscape ? [dialogStyles.dialog, dialogStyles.dialogLandscape] : dialogStyles.dialog,
        compactDialogStyle: isLandscape ? [dialogStyles.dialog, dialogStyles.dialogCompactLandscape] : dialogStyles.dialog,
        titleStyle: isLandscape ? dialogStyles.titleLandscape : dialogStyles.title,
        contentStyle: isLandscape ? dialogStyles.contentLandscape : dialogStyles.content,
        actionsStyle: isLandscape ? dialogStyles.actionsLandscape : dialogStyles.actions,
        listItemStyle: isLandscape ? dialogStyles.listItemLandscape : dialogStyles.listItem,
        buttonStyle: isLandscape ? dialogStyles.buttonLandscape : dialogStyles.button,
        buttonLabelStyle: isLandscape ? dialogStyles.buttonLabelLandscape : undefined,
    };
}

// Get icon/text sizes for landscape
export function getLandscapeSizes(isLandscape: boolean) {
    return {
        iconSize: isLandscape ? 20 : 24,
        titleVariant: isLandscape ? 'titleMedium' : 'titleLarge',
        bodyVariant: isLandscape ? 'bodySmall' : 'bodyMedium',
        listTitleVariant: isLandscape ? 'bodyMedium' : 'bodyLarge',
        listDescriptionVariant: isLandscape ? 'labelSmall' : 'bodySmall',
    } as const;
}
