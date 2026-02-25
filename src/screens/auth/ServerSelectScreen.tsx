import React, { useState } from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { Text, TextInput, Button, useTheme, IconButton } from 'react-native-paper';
import { useAuthStore } from '../../store/authStore';
import { useSettingsStore } from '../../store/settingsStore';
import { jellyfinApi } from '../../api/jellyfin';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { AuthStackParamList } from '../../types/navigation';
import { useNavigation } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Network from 'expo-network';

export default function ServerSelectScreen() {
    const [url, setUrl] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const setServerUrl = useAuthStore((state) => state.setServerUrl);
    const { sourceMode, setDataSource, setOnboardingComplete } = useSettingsStore();
    const navigation = useNavigation<NativeStackNavigationProp<AuthStackParamList>>();
    const theme = useTheme();

    const handleConnect = async () => {
        setLoading(true);
        setError('');

        // Check network connectivity first
        const networkState = await Network.getNetworkStateAsync();
        if (!networkState.isConnected) {
            setError('No network connection. Please check your internet.');
            setLoading(false);
            return;
        }

        let formattedUrl = url.trim();
        if (!formattedUrl.startsWith('http')) {
            formattedUrl = `http://${formattedUrl}`;
        }
        formattedUrl = formattedUrl.replace(/\/$/, "");

        try {
            await jellyfinApi.getPublicSystemInfo(formattedUrl);
            setServerUrl(formattedUrl);
            navigation.navigate('Login');
        } catch (err) {
            setError('Could not connect to server. Please check the URL.');
        } finally {
            setLoading(false);
        }
    };

    const handleSkipToLocal = () => {
        setDataSource('local');
    };

    const handleGoBack = () => {
        setOnboardingComplete(false);
    };

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]}>
            {/* Back button */}
            <View style={styles.backButtonContainer}>
                <IconButton
                    icon="arrow-left"
                    size={24}
                    onPress={handleGoBack}
                />
            </View>

            <ScrollView contentContainerStyle={styles.content}>
                <Text variant="displaySmall" style={[styles.title, { color: theme.colors.primary }]}>Jellyspot</Text>
                <Text variant="bodyLarge" style={[styles.subtitle, { color: theme.colors.onSurfaceVariant }]}>Connect to your Jellyfin Server</Text>

                <TextInput
                    label="Server URL"
                    value={url}
                    onChangeText={setUrl}
                    mode="outlined"
                    placeholder="e.g. 192.168.1.5:8096"
                    autoCapitalize="none"
                    keyboardType="url"
                    style={styles.input}
                    error={!!error}
                />

                {error ? <Text style={{ color: theme.colors.error, marginBottom: 10 }}>{error}</Text> : null}

                <Button
                    mode="contained"
                    onPress={handleConnect}
                    loading={loading}
                    disabled={loading || !url}
                    style={styles.button}
                >
                    Connect
                </Button>

                {/* Show skip button if user selected 'both' mode in onboarding */}
                {sourceMode === 'both' && (
                    <Button
                        mode="text"
                        onPress={handleSkipToLocal}
                        style={styles.skipButton}
                    >
                        Skip to Local Library
                    </Button>
                )}
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    backButtonContainer: {
        paddingLeft: 8,
    },
    content: {
        padding: 24,
        justifyContent: 'center',
    },
    title: {
        fontFamily: 'cursive',
        fontStyle: 'italic',
        fontWeight: 'bold',
        marginBottom: 8,
        textAlign: 'center',
    },
    subtitle: {
        marginBottom: 32,
        textAlign: 'center',
    },
    input: {
        marginBottom: 16,
    },
    button: {
        marginTop: 8,
    },
    skipButton: {
        marginTop: 16,
    },
});
