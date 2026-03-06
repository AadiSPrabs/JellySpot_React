import React, { useState, useRef } from 'react';
import { View, StyleSheet, ScrollView, useWindowDimensions, Animated } from 'react-native';
import { Text, Button, useTheme, Surface, TouchableRipple } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSettingsStore, SourceMode } from '../store/settingsStore';
import { useAuthStore } from '../store/authStore';
import { Server, Smartphone, Check } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { jellyfinApi } from '../api/jellyfin';
import { ActivityIndicator, TextInput } from 'react-native-paper';

interface SourceCardProps {
    title: string;
    description: string;
    icon: React.ReactNode;
    selected: boolean;
    onPress: () => void;
}

function SourceCard({ title, description, icon, selected, onPress }: SourceCardProps) {
    const theme = useTheme();

    return (
        <TouchableRipple
            onPress={onPress}
            rippleColor="rgba(0, 0, 0, 0.1)"
            style={{ borderRadius: 16, marginBottom: 16 }}
        >
            <Surface
                style={[
                    styles.card,
                    {
                        backgroundColor: selected
                            ? theme.colors.primaryContainer
                            : theme.colors.elevation.level2,
                        borderWidth: 2,
                        borderColor: selected
                            ? theme.colors.primary
                            : 'transparent',
                    }
                ]}
                elevation={selected ? 3 : 1}
            >
                <View style={styles.cardContent}>
                    <View style={[
                        styles.iconContainer,
                        { backgroundColor: selected ? theme.colors.primary : theme.colors.surfaceVariant }
                    ]}>
                        {icon}
                    </View>
                    <View style={styles.textContainer}>
                        <Text
                            variant="titleLarge"
                            style={[
                                styles.cardTitle,
                                { color: selected ? theme.colors.onPrimaryContainer : theme.colors.onSurface }
                            ]}
                        >
                            {title}
                        </Text>
                        <Text
                            variant="bodyMedium"
                            style={{
                                color: selected
                                    ? theme.colors.onPrimaryContainer
                                    : theme.colors.onSurfaceVariant
                            }}
                        >
                            {description}
                        </Text>
                    </View>
                </View>
            </Surface>
        </TouchableRipple>
    );
}

export default function OnboardingScreen() {
    const theme = useTheme();
    const { width } = useWindowDimensions();
    const scrollViewRef = useRef<ScrollView>(null);
    const { setSourceMode, setOnboardingComplete, setDataSource } = useSettingsStore();

    const [step, setStep] = useState(0);
    const [jellyfinSelected, setJellyfinSelected] = useState(false);
    const [localSelected, setLocalSelected] = useState(false);

    // Jellyfin Auth State
    const [serverUrl, setServerUrl] = useState('');
    const [isConnecting, setIsConnecting] = useState(false);
    const [isConnected, setIsConnected] = useState(false);
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [isLoggingIn, setIsLoggingIn] = useState(false);
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [error, setError] = useState('');

    // Library Selection State
    const [libraries, setLibraries] = useState<any[]>([]);
    const [isLoadingLibraries, setIsLoadingLibraries] = useState(false);
    const [selectedLibs, setSelectedLibs] = useState<Set<string>>(new Set());

    const { selectedJellyfinLibraries, setSelectedJellyfinLibraries } = useSettingsStore();
    const { login, setServerUrl: setAuthServerUrl } = useAuthStore();

    const canContinue = jellyfinSelected || localSelected;

    const handleNextStep = () => {
        if (step === 0 && canContinue) {
            if (jellyfinSelected) {
                setStep(1); // Go to Jellyfin Login Step
                scrollViewRef.current?.scrollTo({ x: width, animated: true });
            } else {
                setStep(3); // Skip to Finish step (Local only)
                scrollViewRef.current?.scrollTo({ x: width * 3, animated: true });
            }
        } else if (step === 1 && isAuthenticated) {
            setStep(2); // Go to Library Selection Step
            fetchLibraries();
            scrollViewRef.current?.scrollTo({ x: width * 2, animated: true });
        } else if (step === 2) {
            setStep(3); // Go to Finish step
            scrollViewRef.current?.scrollTo({ x: width * 3, animated: true });
        }
    };

    const handlePrevStep = () => {
        if (step === 1) {
            setStep(0);
            scrollViewRef.current?.scrollTo({ x: 0, animated: true });
        } else if (step === 2) {
            setStep(1);
            scrollViewRef.current?.scrollTo({ x: width, animated: true });
        } else if (step === 3) {
            if (jellyfinSelected) {
                setStep(2);
                scrollViewRef.current?.scrollTo({ x: width * 2, animated: true });
            } else {
                setStep(0);
                scrollViewRef.current?.scrollTo({ x: 0, animated: true });
            }
        }
    };

    const handleConnectServer = async () => {
        if (!serverUrl) {
            setError('Please enter a server URL');
            return;
        }

        setError('');
        setIsConnecting(true);

        try {
            // Trim trailing slashes for consistency
            const trimmedUrl = serverUrl.replace(/\/+$/, '');
            setAuthServerUrl(trimmedUrl);
            await jellyfinApi.getPublicSystemInfo(trimmedUrl);
            setIsConnected(true);
            setServerUrl(trimmedUrl);
        } catch (err) {
            console.error('Connection failed:', err);
            setError('Could not connect to server. Check URL and ensure it starts with http:// or https://');
            setIsConnected(false);
        } finally {
            setIsConnecting(false);
        }
    };

    const handleLogin = async () => {
        if (!username || !password) {
            setError('Please enter username and password');
            return;
        }

        setError('');
        setIsLoggingIn(true);

        try {
            const authResponse = await jellyfinApi.authenticate(username, password);
            if (!authResponse || !authResponse.SessionInfo || !authResponse.AccessToken) {
                throw new Error("Invalid response from server");
            }

            const userData = {
                id: authResponse.SessionInfo.UserId,
                name: authResponse.SessionInfo.UserName || username,
                token: authResponse.AccessToken
            };

            login(userData);
            setIsAuthenticated(true);
            handleNextStep();
        } catch (err: any) {
            console.error('Login failed:', err);
            setError(err.message || 'Login failed. Check credentials.');
            setIsAuthenticated(false);
        } finally {
            setIsLoggingIn(false);
        }
    };

    const fetchLibraries = async () => {
        setIsLoadingLibraries(true);
        setError('');
        try {
            const libs = await jellyfinApi.getMusicLibraries();
            setLibraries(libs);
            // Default to selecting all if none were selected previously
            if (selectedJellyfinLibraries.length === 0) {
                setSelectedLibs(new Set(libs.map((l: any) => l.Id)));
            } else {
                setSelectedLibs(new Set(selectedJellyfinLibraries));
            }
        } catch (err) {
            console.error('Failed to load libraries:', err);
            setError('Failed to load libraries');
        } finally {
            setIsLoadingLibraries(false);
        }
    };

    const toggleLibrary = (id: string) => {
        const next = new Set(selectedLibs);
        if (next.has(id)) {
            next.delete(id);
        } else {
            next.add(id);
        }
        setSelectedLibs(next);
        setSelectedJellyfinLibraries(Array.from(next));
    };

    const handleFinish = () => {
        let mode: SourceMode;
        if (jellyfinSelected && localSelected) {
            mode = 'both';
            setDataSource('jellyfin'); // Default to jellyfin when both
        } else if (jellyfinSelected) {
            mode = 'jellyfin';
            setDataSource('jellyfin');
        } else {
            mode = 'local';
            setDataSource('local');
        }

        setSourceMode(mode);
        // Ensure selected libraries are saved
        if (jellyfinSelected) {
            setSelectedJellyfinLibraries(Array.from(selectedLibs));
        }
        setOnboardingComplete(true);
    };

    const renderStepIndicators = () => (
        <View style={styles.indicatorContainer}>
            <View style={[styles.indicator, step === 0 ? { backgroundColor: theme.colors.primary, width: 24 } : { backgroundColor: theme.colors.surfaceVariant }]} />
            {jellyfinSelected && <View style={[styles.indicator, step === 1 ? { backgroundColor: theme.colors.primary, width: 24 } : { backgroundColor: theme.colors.surfaceVariant }]} />}
            {jellyfinSelected && <View style={[styles.indicator, step === 2 ? { backgroundColor: theme.colors.primary, width: 24 } : { backgroundColor: theme.colors.surfaceVariant }]} />}
            <View style={[styles.indicator, step === 3 ? { backgroundColor: theme.colors.primary, width: 24 } : { backgroundColor: theme.colors.surfaceVariant }]} />
        </View>
    );

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]}>
            <ScrollView
                ref={scrollViewRef}
                horizontal
                pagingEnabled
                scrollEnabled={false}
                showsHorizontalScrollIndicator={false}
            >
                {/* Step 0: Source Selection */}
                <View style={{ width }}>
                    <ScrollView contentContainerStyle={styles.scrollContent}>
                        {/* Header */}
                        <View style={styles.header}>
                            <LinearGradient
                                colors={[theme.colors.primary, theme.colors.tertiary]}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 1 }}
                                style={styles.logoGradient}
                            >
                                <Text style={styles.logoText}>🎵</Text>
                            </LinearGradient>
                            <Text variant="headlineLarge" style={[styles.title, { color: theme.colors.onSurface }]}>
                                Welcome to Jellyspot
                            </Text>
                            <Text variant="bodyLarge" style={{ color: theme.colors.onSurfaceVariant, textAlign: 'center' }}>
                                Choose where you want to play your music from
                            </Text>
                        </View>

                        {/* Source Selection Cards */}
                        <View style={styles.cardsContainer}>
                            <SourceCard
                                title="Jellyfin Server"
                                description="Stream music from your personal Jellyfin media server. Requires server connection."
                                icon={<Server size={28} color={jellyfinSelected ? '#fff' : theme.colors.onSurfaceVariant} />}
                                selected={jellyfinSelected}
                                onPress={() => setJellyfinSelected(!jellyfinSelected)}
                            />

                            <SourceCard
                                title="Local Music"
                                description="Play music stored directly on your device. No internet required."
                                icon={<Smartphone size={28} color={localSelected ? '#fff' : theme.colors.onSurfaceVariant} />}
                                selected={localSelected}
                                onPress={() => setLocalSelected(!localSelected)}
                            />
                        </View>

                        {/* Hint */}
                        <Text
                            variant="bodySmall"
                            style={{
                                color: theme.colors.onSurfaceVariant,
                                textAlign: 'center',
                                marginTop: 8
                            }}
                        >
                            {jellyfinSelected && localSelected
                                ? "You can switch between sources anytime"
                                : "Select one or both options"}
                        </Text>
                    </ScrollView>
                </View>

                {/* Step 1: Jellyfin Connection & Login */}
                <View style={{ width }}>
                    <ScrollView contentContainerStyle={styles.scrollContent}>
                        <View style={styles.header}>
                            <View style={[styles.logoGradient, { backgroundColor: theme.colors.primaryContainer }]}>
                                <Server size={40} color={theme.colors.primary} />
                            </View>
                            <Text variant="headlineLarge" style={[styles.title, { color: theme.colors.onSurface }]}>
                                Connect to Jellyfin
                            </Text>
                        </View>

                        <Surface style={styles.card} elevation={1}>
                            <View style={{ gap: 16 }}>
                                {!isConnected ? (
                                    <>
                                        <TextInput
                                            label="Server URL"
                                            value={serverUrl}
                                            onChangeText={(text) => {
                                                setServerUrl(text);
                                                setIsConnected(false);
                                                setError('');
                                            }}
                                            placeholder="https://your-server.com"
                                            mode="outlined"
                                            autoCapitalize="none"
                                            autoCorrect={false}
                                            keyboardType="url"
                                            disabled={isConnecting}
                                        />
                                        <Button
                                            mode="contained"
                                            onPress={handleConnectServer}
                                            loading={isConnecting}
                                            disabled={isConnecting || !serverUrl}
                                        >
                                            Connect
                                        </Button>
                                    </>
                                ) : (
                                    <>
                                        <Text variant="bodyMedium" style={{ color: theme.colors.primary, textAlign: 'center', marginBottom: 8 }}>
                                            Server Connected: {serverUrl}
                                        </Text>

                                        <TextInput
                                            label="Username"
                                            value={username}
                                            onChangeText={setUsername}
                                            mode="outlined"
                                            autoCapitalize="none"
                                            autoCorrect={false}
                                            disabled={isLoggingIn}
                                        />
                                        <TextInput
                                            label="Password"
                                            value={password}
                                            onChangeText={setPassword}
                                            mode="outlined"
                                            secureTextEntry
                                            disabled={isLoggingIn}
                                        />

                                        <Button
                                            mode="contained"
                                            onPress={handleLogin}
                                            loading={isLoggingIn}
                                            disabled={isLoggingIn || !username || !password}
                                        >
                                            Login
                                        </Button>

                                        <Button
                                            mode="text"
                                            onPress={() => {
                                                setIsConnected(false);
                                                setServerUrl('');
                                            }}
                                            disabled={isLoggingIn}
                                        >
                                            Change Server
                                        </Button>
                                    </>
                                )}
                            </View>
                        </Surface>

                        {!!error && (
                            <Surface style={[styles.warningBadge, { backgroundColor: theme.colors.errorContainer, marginTop: 16 }]} elevation={0}>
                                <Text style={{ color: theme.colors.onErrorContainer, marginLeft: 8, flex: 1 }}>{error}</Text>
                            </Surface>
                        )}
                    </ScrollView>
                </View>

                {/* Step 2: Jellyfin Library Selection */}
                <View style={{ width }}>
                    <ScrollView contentContainerStyle={styles.scrollContent}>
                        <View style={styles.header}>
                            <View style={[styles.logoGradient, { backgroundColor: theme.colors.primaryContainer }]}>
                                <Check size={40} color={theme.colors.primary} />
                            </View>
                            <Text variant="headlineLarge" style={[styles.title, { color: theme.colors.onSurface }]}>
                                Select Libraries
                            </Text>
                            <Text variant="bodyLarge" style={{ color: theme.colors.onSurfaceVariant, textAlign: 'center', marginTop: 8 }}>
                                Choose which music libraries to sync from your server.
                            </Text>
                        </View>

                        {isLoadingLibraries ? (
                            <View style={styles.libraryLoadingContainer}>
                                <ActivityIndicator size="small" />
                                <Text variant="bodyMedium" style={{ marginLeft: 8 }}>Loading libraries...</Text>
                            </View>
                        ) : libraries.length > 0 ? (
                            <View style={{ gap: 8 }}>
                                {libraries.map((lib: any) => {
                                    const isSelected = selectedLibs.has(lib.Id);
                                    return (
                                        <TouchableRipple
                                            key={lib.Id}
                                            onPress={() => toggleLibrary(lib.Id)}
                                            style={{ borderRadius: 8 }}
                                        >
                                            <Surface style={[styles.libraryItem, { backgroundColor: theme.colors.surfaceVariant }]} elevation={0}>
                                                <Text style={{ flex: 1, color: theme.colors.onSurface }}>{lib.Name}</Text>
                                                <View style={[styles.checkboxContainer, {
                                                    borderColor: isSelected ? theme.colors.primary : theme.colors.outline,
                                                    backgroundColor: isSelected ? theme.colors.primary : 'transparent'
                                                }]}>
                                                    {isSelected && <Check size={16} color={theme.colors.onPrimary} />}
                                                </View>
                                            </Surface>
                                        </TouchableRipple>
                                    );
                                })}
                            </View>
                        ) : (
                            <Text style={{ textAlign: 'center', color: theme.colors.onSurfaceVariant }}>
                                No music libraries found on this server.
                            </Text>
                        )}

                        <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, textAlign: 'center', marginTop: 24 }}>
                            You can change this anytime in Settings.
                        </Text>
                    </ScrollView>
                </View>

                {/* Step 3: Confirmation */}
                <View style={{ width }}>
                    <ScrollView contentContainerStyle={styles.scrollContent}>
                        <View style={styles.header}>
                            <View style={[styles.logoGradient, { backgroundColor: theme.colors.primaryContainer }]}>
                                <Check size={40} color={theme.colors.primary} />
                            </View>
                            <Text variant="headlineLarge" style={[styles.title, { color: theme.colors.onSurface }]}>
                                You're all set!
                            </Text>
                            <Text variant="bodyLarge" style={{ color: theme.colors.onSurfaceVariant, textAlign: 'center', marginTop: 16 }}>
                                {jellyfinSelected && localSelected
                                    ? "We'll set up both local and server-based libraries. You can switch between them in Settings."
                                    : jellyfinSelected
                                        ? "Your Jellyfin server is connected and ready to go!"
                                        : "We'll scan your device for local music files."}
                            </Text>
                        </View>
                    </ScrollView>
                </View>
            </ScrollView>

            {/* Footer with Step Indicators & Buttons */}
            <View style={styles.footer}>
                {renderStepIndicators()}
                {step > 0 && (
                    <Button
                        mode="text"
                        onPress={handlePrevStep}
                        style={{ marginBottom: 8 }}
                    >
                        Back
                    </Button>
                )}
                <Button
                    mode="contained"
                    onPress={step === 3 ? handleFinish : handleNextStep}
                    disabled={(step === 0 && !canContinue) || (step === 1 && !isAuthenticated)}
                    style={styles.continueButton}
                    contentStyle={styles.continueButtonContent}
                    labelStyle={{ fontSize: 16, fontWeight: 'bold' }}
                >
                    {step === 3 ? 'Let\'s Go!' : 'Continue'}
                </Button>
            </View>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    scrollContent: {
        flexGrow: 1,
        padding: 24,
        paddingBottom: 100,
    },
    header: {
        alignItems: 'center',
        marginBottom: 40,
        marginTop: 20,
    },
    logoGradient: {
        width: 80,
        height: 80,
        borderRadius: 20,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 24,
    },
    logoText: {
        fontSize: 40,
    },
    title: {
        fontWeight: 'bold',
        marginBottom: 8,
        textAlign: 'center',
    },
    cardsContainer: {
        marginTop: 16,
    },
    card: {
        borderRadius: 16,
        padding: 20,
    },
    cardContent: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    iconContainer: {
        width: 56,
        height: 56,
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 16,
    },
    textContainer: {
        flex: 1,
    },
    cardTitle: {
        fontWeight: '600',
        marginBottom: 4,
    },
    checkIcon: {
        width: 32,
        height: 32,
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
        marginLeft: 8,
    },
    footer: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        padding: 24,
        paddingBottom: 32,
    },
    continueButton: {
        borderRadius: 12,
    },
    continueButtonContent: {
        paddingVertical: 8,
    },
    indicatorContainer: {
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 24,
    },
    indicator: {
        height: 8,
        width: 8,
        borderRadius: 4,
        marginHorizontal: 4,
    },
    warningBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 12,
        borderRadius: 8,
    },
    libraryLoadingContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
    },
    libraryItem: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 16,
        borderRadius: 8,
    },
    checkboxContainer: {
        width: 24,
        height: 24,
        borderRadius: 4,
        borderWidth: 2,
        alignItems: 'center',
        justifyContent: 'center',
    },
});
