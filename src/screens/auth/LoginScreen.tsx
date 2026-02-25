import React, { useState, useEffect, useRef } from 'react';
import { View, StyleSheet, Modal, ActivityIndicator } from 'react-native';
import { Text, TextInput, Button, useTheme } from 'react-native-paper';
import { useAuthStore } from '../../store/authStore';
import { useSettingsStore } from '../../store/settingsStore';
import { jellyfinApi } from '../../api/jellyfin';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function LoginScreen() {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const login = useAuthStore((state) => state.login);
    const { sourceMode, setDataSource } = useSettingsStore();
    const theme = useTheme();

    const handleLogin = async () => {
        setLoading(true);
        setError('');
        try {
            const response = await jellyfinApi.authenticate(username, password);
            login(
                {
                    id: response.User.Id,
                    name: response.User.Name,
                    token: response.AccessToken
                }
            );
        } catch (err) {
            setError('Invalid username or password.');
        } finally {
            setLoading(false);
        }
    };

    // Quick Connect Logic
    const [qcCode, setQcCode] = useState('');
    const [qcSecret, setQcSecret] = useState('');
    const [showQcModal, setShowQcModal] = useState(false);
    const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

    const handleStartQuickConnect = async () => {
        setLoading(true);
        setError('');
        try {
            const data = await jellyfinApi.initiateQuickConnect();
            setQcCode(data.Code);
            setQcSecret(data.Secret);
            setShowQcModal(true);
            startPolling(data.Secret);
        } catch (err) {
            console.error(err);
            setError('Failed to initiate Quick Connect.');
        } finally {
            setLoading(false);
        }
    };

    const startPolling = (secret: string) => {
        if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);

        pollIntervalRef.current = setInterval(async () => {
            try {
                const response = await jellyfinApi.checkQuickConnect(secret);
                if (response.Authenticated) {
                    clearInterval(pollIntervalRef.current!);
                    pollIntervalRef.current = null;

                    try {
                        // Exchange secret for actual Access Token
                        const authResult = await jellyfinApi.authenticateWithQuickConnect(secret);

                        login({
                            id: authResult.User.Id,
                            name: authResult.User.Name,
                            token: authResult.AccessToken
                        });
                        setShowQcModal(false);
                    } catch (fetchError) {
                        console.error("QC Auth Error:", fetchError);
                        alert(`Quick Connect authorized, but failed to complete login.\n\nError: ${fetchError}`);
                        setShowQcModal(false);
                    }
                }
            } catch (e) {
                // Not authenticated yet or error fetching user, ignore

            }
        }, 2000); // Check every 2 seconds
    };

    const handleCancelQc = () => {
        if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
        setShowQcModal(false);
    };

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
        };
    }, []);

    const handleSkipToLocal = () => {
        // Skip Jellyfin login and go directly to local library
        setDataSource('local');
    };

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]}>
            <View style={styles.content}>
                {/* Jellyspot Branding */}
                <Text variant="displayMedium" style={[styles.branding, { color: theme.colors.primary }]}>JellySpot</Text>
                <Text variant="headlineMedium" style={[styles.title, { color: theme.colors.onSurface }]}>Log In</Text>

                <TextInput
                    label="Username"
                    value={username}
                    onChangeText={setUsername}
                    mode="outlined"
                    autoCapitalize="none"
                    style={styles.input}
                />

                <TextInput
                    label="Password"
                    value={password}
                    onChangeText={setPassword}
                    mode="outlined"
                    secureTextEntry={!showPassword}
                    style={styles.input}
                    right={
                        <TextInput.Icon
                            icon={showPassword ? "eye-off" : "eye"}
                            onPress={() => setShowPassword(!showPassword)}
                        />
                    }
                />

                {error ? <Text style={{ color: theme.colors.error, marginBottom: 10 }}>{error}</Text> : null}

                <Button
                    mode="contained"
                    onPress={handleLogin}
                    loading={loading}
                    disabled={loading || !username}
                    style={styles.button}
                >
                    Log In
                </Button>

                <Button
                    mode="outlined"
                    onPress={handleStartQuickConnect}
                    disabled={loading}
                    style={styles.button}
                >
                    Quick Connect
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
            </View>

            {/* Quick Connect Modal */}
            <Modal visible={showQcModal} animationType="slide" transparent>
                <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'center', padding: 20 }}>
                    <View style={{ backgroundColor: theme.colors.surface, borderRadius: 12, padding: 30, alignItems: 'center' }}>
                        <Text variant="headlineSmall" style={{ color: theme.colors.onSurface, marginBottom: 10, fontWeight: 'bold' }}>Quick Connect</Text>
                        <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant, textAlign: 'center', marginBottom: 20 }}>
                            Enter this code in your Jellyfin dashboard or Quick Connect page:
                        </Text>

                        <Text variant="displayMedium" style={{ color: theme.colors.primary, fontWeight: 'bold', letterSpacing: 4, marginBottom: 30 }}>
                            {qcCode}
                        </Text>

                        <ActivityIndicator size="small" color={theme.colors.secondary} style={{ marginBottom: 20 }} />
                        <Text variant="bodySmall" style={{ color: theme.colors.outline }}>Waiting for authorization...</Text>

                        <Button mode="text" onPress={handleCancelQc} style={{ marginTop: 20 }}>
                            Cancel
                        </Button>
                    </View>
                </View>
            </Modal>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    content: {
        flex: 1,
        padding: 24,
        justifyContent: 'center',
    },
    title: {
        marginBottom: 24,
        textAlign: 'center',
        fontWeight: 'bold',
    },
    branding: {
        fontFamily: 'cursive',
        fontStyle: 'italic',
        fontWeight: 'bold',
        textAlign: 'center',
        marginBottom: 8,
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
