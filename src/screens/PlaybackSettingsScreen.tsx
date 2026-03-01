import React from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { Text, List, Switch, RadioButton, Divider, useTheme, IconButton } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useSettingsStore } from '../store/settingsStore';
import Slider from '@react-native-community/slider';
import SettingsGroup from '../components/SettingsGroup';
import SettingsItem from '../components/SettingsItem';

export default function PlaybackSettingsScreen() {
    const theme = useTheme();
    const navigation = useNavigation();
    const {
        audioQuality,
        setAudioQuality,
        showTechnicalDetails,
        setShowTechnicalDetails,
        lyricsSourcePreference,
        setLyricsSourcePreference
    } = useSettingsStore();

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]} edges={['top']}>
            <View style={styles.appBar}>
                <IconButton icon="arrow-left" onPress={() => navigation.goBack()} />
                <Text variant="titleLarge" style={{ fontWeight: 'bold' }}>Playback</Text>
            </View>

            <ScrollView contentContainerStyle={styles.content}>
                <SettingsGroup title="Audio Quality">
                    <RadioButton.Group
                        onValueChange={value => {
                            setAudioQuality(value as any);
                        }}
                        value={audioQuality}
                    >
                        <SettingsItem
                            title="Lossless (Direct Play)"
                            description="Original quality. Requires less CPU on server but more data."
                            onPress={() => setAudioQuality('lossless')}
                            right={() => <RadioButton value="lossless" />}
                        />
                        <SettingsItem
                            title="High (320 kbps)"
                            description="High quality MP3. Requires server transcoding."
                            onPress={() => setAudioQuality('high')}
                            right={() => <RadioButton value="high" />}
                        />
                        <SettingsItem
                            title="Data Saver (128 kbps)"
                            description="Low data usage. Requires server transcoding."
                            onPress={() => setAudioQuality('low')}
                            right={() => <RadioButton value="low" />}
                        />
                        <SettingsItem
                            title="Auto"
                            description="WiFi → Lossless, Cellular → Data Saver (128 kbps)"
                            onPress={() => setAudioQuality('auto')}
                            right={() => <RadioButton value="auto" />}
                        />
                    </RadioButton.Group>
                    {(audioQuality !== 'lossless') && (
                        <View style={{ paddingHorizontal: 16, paddingBottom: 16, paddingTop: 8 }}>
                            <Text style={{ color: theme.colors.error }} variant="bodySmall">
                                Note: Transcoding requires permissions on your Jellyfin server. If playback fails, switch to Lossless.
                            </Text>
                        </View>
                    )}
                </SettingsGroup>

                <SettingsGroup title="Lyrics Source Preference">
                    <RadioButton.Group
                        onValueChange={value => {
                            setLyricsSourcePreference(value as any);
                        }}
                        value={lyricsSourcePreference}
                    >
                        <SettingsItem
                            title="LRCLIB (Recommended)"
                            description="Prioritize open-source synced lyrics from LRCLIB."
                            onPress={() => setLyricsSourcePreference('lrclib')}
                            right={() => <RadioButton value="lrclib" />}
                        />
                        <SettingsItem
                            title="Jellyfin"
                            description="Prioritize embedded or saved lyrics from your server."
                            onPress={() => setLyricsSourcePreference('jellyfin')}
                            right={() => <RadioButton value="jellyfin" />}
                        />
                        <SettingsItem
                            title="Offline Only"
                            description="Only show lyrics already saved in Jellyfin (no external requests)."
                            onPress={() => setLyricsSourcePreference('offline-only')}
                            right={() => <RadioButton value="offline-only" />}
                        />
                    </RadioButton.Group>
                </SettingsGroup>

                <SettingsGroup title="Playback Features">
                    <SettingsItem
                        title="Show Technical Details"
                        description="Display bitrate, codec, and format in player"
                        onPress={() => setShowTechnicalDetails(!showTechnicalDetails)}
                        right={() => <Switch value={showTechnicalDetails} onValueChange={setShowTechnicalDetails} />}
                    />
                </SettingsGroup>
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
});
