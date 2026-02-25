import React from 'react';
import { View, StyleSheet } from 'react-native';
import { useTheme } from 'react-native-paper';
import { usePlayerStore } from '../store/playerStore';
import { useShallow } from 'zustand/react/shallow';

export const MiniProgressBar = () => {
    const { positionMillis, durationMillis } = usePlayerStore(useShallow(state => ({
        positionMillis: state.positionMillis,
        durationMillis: state.durationMillis
    })));
    const theme = useTheme();

    const progressPercent = durationMillis > 0 ? positionMillis / durationMillis : 0;

    return (
        <View style={[styles.background, { backgroundColor: theme.colors.surfaceVariant }]}>
            <View
                style={[
                    styles.fill,
                    {
                        width: `${progressPercent * 100}%`,
                        backgroundColor: theme.colors.primary
                    }
                ]}
            />
        </View>
    );
};

const styles = StyleSheet.create({
    background: {
        height: 2,
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 1,
    },
    fill: {
        height: '100%',
    }
});
