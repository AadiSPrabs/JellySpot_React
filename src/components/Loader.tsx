import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { ActivityIndicator, useTheme } from 'react-native-paper';

interface LoaderProps {
    size?: 'small' | 'large' | number;
    color?: string;
    style?: ViewStyle;
    fullScreen?: boolean;
}

export const Loader = ({ size = 'large', color, style, fullScreen = true }: LoaderProps) => {
    const theme = useTheme();
    const loaderColor = color || theme.colors.primary;

    return (
        <View style={[
            styles.container,
            fullScreen && styles.fullScreen,
            fullScreen && { backgroundColor: theme.colors.background },
            style
        ]}>
            <ActivityIndicator size={size} color={loaderColor} />
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    fullScreen: {
        flex: 1,
        width: '100%',
        height: '100%',
    }
});
