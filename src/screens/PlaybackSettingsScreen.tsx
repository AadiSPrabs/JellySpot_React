import React from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { Text, List, Switch, RadioButton, Divider, useTheme, IconButton } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useSettingsStore } from '../store/settingsStore';
import Slider from '@react-native-community/slider';

export default function PlaybackSettingsScreen() {
    const theme = useTheme();
    const navigation = useNavigation();
    const {
        audioQuality,
        setAudioQuality,
        showTechnicalDetails,
        setShowTechnicalDetails,
        crossfadeEnabled,
        setCrossfadeEnabled,
        crossfadeDuration,
        setCrossfadeDuration
    } = useSettingsStore();

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]} edges={['top']}>
            <View style={styles.appBar}>
                <IconButton icon="arrow-left" onPress={() => navigation.goBack()} />
                <Text variant="titleLarge" style={{ fontWeight: 'bold' }}>Playback</Text>
            </View>

            <ScrollView contentContainerStyle={styles.content}>
                <List.Section title="Audio Quality">
                    <RadioButton.Group
                        onValueChange={value => {
                            setAudioQuality(value as any);
                        }}
                        value={audioQuality}
                    >
                        <List.Item
                            title="Lossless (Direct Play)"
                            description="Original quality. Requires less CPU on server but more data."
                            left={() => <RadioButton value="lossless" />}
                            onPress={() => setAudioQuality('lossless')}
                        />
                        <List.Item
                            title="High (320 kbps)"
                            description="High quality MP3. Requires server transcoding."
                            left={() => <RadioButton value="high" />}
                            onPress={() => setAudioQuality('high')}
                        />
                        <List.Item
                            title="Data Saver (128 kbps)"
                            description="Low data usage. Requires server transcoding."
                            left={() => <RadioButton value="low" />}
                            onPress={() => setAudioQuality('low')}
                        />
                        <List.Item
                            title="Auto"
                            description="WiFi → Lossless, Cellular → Data Saver (128 kbps)"
                            left={() => <RadioButton value="auto" />}
                            onPress={() => setAudioQuality('auto')}
                        />
                    </RadioButton.Group>
                    {(audioQuality !== 'lossless') && (
                        <View style={{ paddingHorizontal: 16, paddingTop: 8 }}>
                            <Text style={{ color: theme.colors.error }} variant="bodySmall">
                                Note: Transcoding requires permissions on your Jellyfin server. If playback fails, switch to Lossless.
                            </Text>
                        </View>
                    )}
                </List.Section>

                <Divider />

                <List.Section title="Playback Features">
                    <List.Item
                        title="Crossfade"
                        description="Smooth transitions between songs"
                        right={() => <Switch value={crossfadeEnabled} onValueChange={setCrossfadeEnabled} />}
                    />
                    {crossfadeEnabled && (
                        <View style={styles.sliderContainer}>
                            <View style={styles.sliderHeader}>
                                <Text variant="bodyMedium">Crossfade Duration</Text>
                                <Text variant="labelMedium" style={{ color: theme.colors.primary }}>
                                    {crossfadeDuration}s
                                </Text>
                            </View>
                            <Slider
                                style={styles.slider}
                                minimumValue={1}
                                maximumValue={12}
                                step={1}
                                value={crossfadeDuration}
                                onValueChange={(value) => setCrossfadeDuration(value)}
                                minimumTrackTintColor={theme.colors.primary}
                                maximumTrackTintColor={theme.colors.surfaceVariant}
                                thumbTintColor={theme.colors.primary}
                            />
                            <View style={styles.sliderLabels}>
                                <Text variant="labelSmall" style={{ color: theme.colors.outline }}>1s</Text>
                                <Text variant="labelSmall" style={{ color: theme.colors.outline }}>12s</Text>
                            </View>
                        </View>
                    )}
                    <List.Item
                        title="Show Technical Details"
                        description="Display bitrate, codec, and format in player"
                        right={() => <Switch value={showTechnicalDetails} onValueChange={setShowTechnicalDetails} />}
                    />
                </List.Section>
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    appBar: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 8,
        marginBottom: 16,
    },
    content: {
        paddingBottom: 40,
    },
    sliderContainer: {
        paddingHorizontal: 16,
        paddingVertical: 8,
    },
    sliderHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 8,
    },
    slider: {
        width: '100%',
        height: 40,
    },
    sliderLabels: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginTop: -4,
    },
});
