import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text, useTheme } from 'react-native-paper';
import { usePlayerStore } from '../store/playerStore';
import { SeekBar } from './SeekBar';

interface ProgressControlProps {
    activeColor?: string;
    inactiveColor?: string;
    textColor?: string;
}

import { useShallow } from 'zustand/react/shallow';

// ...

export const ProgressControl: React.FC<ProgressControlProps> = ({ activeColor, inactiveColor, textColor }) => {
    const { positionMillis, durationMillis, seek } = usePlayerStore(useShallow(state => ({
        positionMillis: state.positionMillis,
        durationMillis: state.durationMillis,
        seek: state.seek,
    })));
    const theme = useTheme();

    const formatTime = (millis: number) => {
        if (!millis) return '0:00';
        const totalSeconds = Math.floor(millis / 1000);
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
    };

    return (
        <View style={styles.container}>
            <View style={styles.seekBarContainer}>
                <SeekBar
                    progress={durationMillis > 0 ? positionMillis / durationMillis : 0}
                    durationMillis={durationMillis}
                    onSeek={seek}
                    color={activeColor}
                    trackColor={inactiveColor}
                />
            </View>
            <View style={styles.timeContainer}>
                <Text variant="bodySmall" style={{ color: textColor || theme.colors.onSurfaceVariant, fontVariant: ['tabular-nums'] }}>
                    {formatTime(positionMillis)}
                </Text>
                <Text variant="bodySmall" style={{ color: textColor || theme.colors.onSurfaceVariant, fontVariant: ['tabular-nums'] }}>
                    {formatTime(durationMillis)}
                </Text>
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        marginBottom: 20,
    },
    seekBarContainer: {
        marginBottom: 4,
    },
    timeContainer: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingHorizontal: 0,
    },
});
