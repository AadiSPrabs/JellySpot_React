import React from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { useTheme } from 'react-native-paper';
import { MaterialCommunityIcons as Icon } from '@expo/vector-icons';

interface ShuffleFabProps {
    onPress: () => void;
    size?: number;
    style?: any;
    iconColor?: string;
    backgroundColor?: string;
}

export const ShuffleFab = ({
    onPress,
    size = 50,
    style,
    iconColor,
    backgroundColor
}: ShuffleFabProps) => {
    const theme = useTheme();
    const bgColor = backgroundColor || theme.colors.primary;
    const iColor = iconColor || theme.colors.onPrimary;

    return (
        <TouchableOpacity
            style={[
                styles.container,
                {
                    width: size,
                    height: size,
                    borderRadius: size / 2,
                    backgroundColor: bgColor,
                },
                style
            ]}
            onPress={onPress}
            activeOpacity={0.8}
        >
            <Icon name="shuffle" size={size * 0.5} color={iColor} />
        </TouchableOpacity>
    );
};

const styles = StyleSheet.create({
    container: {
        justifyContent: 'center',
        alignItems: 'center',
        elevation: 6,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.3,
        shadowRadius: 3,
    },
});
