import React, { useState, useEffect, useRef } from 'react';
import { View, StyleSheet, ScrollView, Alert, Platform, UIManager, Modal, FlatList, TouchableOpacity } from 'react-native';
import { Text, Button, useTheme, Surface, IconButton, Switch, TextInput, ActivityIndicator, Checkbox } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useSettingsStore, SourceMode } from '../store/settingsStore';
import { useAuthStore } from '../store/authStore';
import { jellyfinApi } from '../api/jellyfin';
import { Server, Smartphone, Check, AlertCircle, Library } from 'lucide-react-native';
import SettingsGroup from '../components/SettingsGroup';

interface MusicLibrary {
    Id: string;
    Name: string;
    CollectionType?: string;
}

export default function SourceModeSettingsScreen() {
    const theme = useTheme();
    const navigation = useNavigation();
    const { sourceMode, setSourceMode, setDataSource, selectedJellyfinLibraries, setSelectedJellyfinLibraries } = useSettingsStore();
    const { serverUrl, isAuthenticated, user, setServerUrl, login, logout } = useAuthStore();

    // Toggle states
    const [jellyfinEnabled, setJellyfinEnabled] = useState(sourceMode === 'jellyfin' || sourceMode === 'both');
    const [localEnabled, setLocalEnabled] = useState(sourceMode === 'local' || sourceMode === 'both');

    // Jellyfin config states
    const [serverUrlInput, setServerUrlInput] = useState(serverUrl || '');
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [connecting, setConnecting] = useState(false);
    const [loggingIn, setLoggingIn] = useState(false);
    const [error, setError] = useState('');
    const [serverConnected, setServerConnected] = useState(!!serverUrl);

    // Library selection state
    const [musicLibraries, setMusicLibraries] = useState<MusicLibrary[]>([]);
    const [loadingLibraries, setLoadingLibraries] = useState(false);
    const [selectedLibs, setSelectedLibs] = useState<Set<string>>(new Set(selectedJellyfinLibraries));

    // Quick Connect State
    const [qcCode, setQcCode] = useState('');
    const [qcSecret, setQcSecret] = useState('');
    const [showQcModal, setShowQcModal] = useState(false);
    const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

    const canSave = jellyfinEnabled || localEnabled;

    // Helper to save source mode
    const saveSourceMode = (jellyfin: boolean, local: boolean) => {
        let mode: SourceMode;
        if (jellyfin && local) {
            mode = 'both';
            // When both are enabled, default to jellyfin view so Downloads tab shows
            setDataSource('jellyfin');
        } else if (jellyfin) {
            mode = 'jellyfin';
            setDataSource('jellyfin');
        } else if (local) {
            mode = 'local';
            setDataSource('local');
        } else {
            // At least one must be enabled, don't save if both off
            return;
        }
        setSourceMode(mode);
    };

    const handleJellyfinToggle = (value: boolean) => {
        setJellyfinEnabled(value);
        if (!value) {
            setError('');
            // When turning Jellyfin OFF, save source mode immediately
            if (localEnabled) {
                saveSourceMode(false, true);
            }
        } else {
            // When turning Jellyfin ON:
            // If already authenticated, save immediately
            // If not authenticated, wait for login to complete (saves in handleLogin)
            if (isAuthenticated) {
                saveSourceMode(true, localEnabled);
            }
        }
    };

    const handleLocalToggle = (value: boolean) => {
        setLocalEnabled(value);
        // Auto-save if at least one is enabled
        if (value || jellyfinEnabled) {
            saveSourceMode(jellyfinEnabled, value);
        }
    };

    const handleConnectServer = async () => {
        setConnecting(true);
        setError('');
        let formattedUrl = serverUrlInput.trim();
        if (!formattedUrl.startsWith('http')) {
            formattedUrl = `http://${formattedUrl}`;
        }
        formattedUrl = formattedUrl.replace(/\/$/, '');

        try {
            await jellyfinApi.getPublicSystemInfo(formattedUrl);
            setServerUrl(formattedUrl);
            setServerConnected(true);
        } catch (err) {
            setError('Could not connect to server. Please check the URL.');
        } finally {
            setConnecting(false);
        }
    };

    const handleLogin = async () => {
        setLoggingIn(true);
        setError('');
        try {
            const response = await jellyfinApi.authenticate(username, password);
            login({
                id: response.User.Id,
                name: response.User.Name,
                token: response.AccessToken
            });
            setUsername('');
            setPassword('');
            // After successful auth, save the source mode to include Jellyfin
            saveSourceMode(jellyfinEnabled, localEnabled);
        } catch (err) {
            setError('Invalid username or password.');
        } finally {
            setLoggingIn(false);
        }
    };

    const handleDisconnect = () => {
        // If only Jellyfin is enabled, switch to local mode to prevent auth redirect
        if (!localEnabled) {
            setLocalEnabled(true);
            setSourceMode('local');
            setDataSource('local');
        } else if (jellyfinEnabled && localEnabled) {
            // Both enabled, just switch to local-only
            setJellyfinEnabled(false);
            setSourceMode('local');
            setDataSource('local');
        }

        // Clear Jellyfin credentials
        logout();
        setServerConnected(false);
        setServerUrlInput('');
        setServerUrlInput('');
    };

    // Server scanning feature removed

    // --- Feature: Quick Connect ---
    const handleStartQuickConnect = async () => {
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
                        // Exchange secret for actual token
                        const authResult = await jellyfinApi.authenticateWithQuickConnect(secret);

                        // Perform login
                        login({
                            id: authResult.User.Id,
                            name: authResult.User.Name,
                            token: authResult.AccessToken
                        });
                        setUsername('');
                        setPassword('');
                        saveSourceMode(jellyfinEnabled, localEnabled);
                        setShowQcModal(false);
                    } catch (fetchError) {
                        console.error("QC Auth Error:", fetchError);
                        Alert.alert("Error", "Quick Connect authorized, but failed to complete login.");
                        setShowQcModal(false);
                    }
                }
            } catch (e) {
                // Not authenticated yet, continue polling
            }
        }, 2000);
    };

    const handleCancelQc = () => {
        if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
        setShowQcModal(false);
    };

    useEffect(() => {
        return () => {
            if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
        };
    }, []);

    // Fetch music libraries when authenticated
    useEffect(() => {
        const fetchLibraries = async () => {
            if (!isAuthenticated) {
                setMusicLibraries([]);
                return;
            }

            setLoadingLibraries(true);
            try {
                const libraries = await jellyfinApi.getMusicLibraries();
                setMusicLibraries(libraries);

                // If no libraries are selected yet and we have libraries, select all by default
                if (selectedJellyfinLibraries.length === 0 && libraries.length > 0) {
                    // Leave empty to mean "all libraries" - don't pre-select
                }
            } catch (error) {
                console.error('Failed to fetch music libraries:', error);
            } finally {
                setLoadingLibraries(false);
            }
        };

        fetchLibraries();
    }, [isAuthenticated]);

    // Handle library toggle
    const handleLibraryToggle = (libraryId: string) => {
        const newSelected = new Set(selectedLibs);
        if (newSelected.has(libraryId)) {
            newSelected.delete(libraryId);
        } else {
            newSelected.add(libraryId);
        }
        setSelectedLibs(newSelected);
        // Save to settings store
        setSelectedJellyfinLibraries(Array.from(newSelected));
    };

    // Select/deselect all libraries
    const handleSelectAllLibraries = () => {
        if (selectedLibs.size === musicLibraries.length) {
            // All selected, deselect all (means use all libraries)
            setSelectedLibs(new Set());
            setSelectedJellyfinLibraries([]);
        } else {
            // Select all
            const allIds = musicLibraries.map(lib => lib.Id);
            setSelectedLibs(new Set(allIds));
            setSelectedJellyfinLibraries(allIds);
        }
    };

    const handleSave = () => {
        let mode: SourceMode;
        if (jellyfinEnabled && localEnabled) {
            mode = 'both';
        } else if (jellyfinEnabled) {
            mode = 'jellyfin';
            setDataSource('jellyfin');
        } else {
            mode = 'local';
            setDataSource('local');
        }

        setSourceMode(mode);
        navigation.goBack();
    };

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]} edges={['top']}>
            <View style={[styles.appBar, { zIndex: 1 }]}>
                <IconButton icon="arrow-left" onPress={() => navigation.goBack()} />
                <Text variant="titleLarge" style={{ fontWeight: 'bold' }}>Music Sources</Text>
            </View>

            <ScrollView
                style={{ flex: 1 }}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
            >
                <Text
                    variant="bodyMedium"
                    style={{ color: theme.colors.onSurfaceVariant, marginBottom: 24 }}
                >
                    Enable the music sources you want to use.
                </Text>

                {/* Jellyfin Card */}
                <SettingsGroup>
                    <View style={{ padding: 16 }}>
                        <View style={styles.cardHeader}>
                            <View style={[styles.iconContainer, { backgroundColor: theme.colors.surfaceVariant }]}>
                                <Server size={24} color={theme.colors.onSurfaceVariant} />
                            </View>
                            <View style={styles.textContainer}>
                                <Text variant="titleMedium" style={{ fontWeight: '600', color: theme.colors.onSurface }}>
                                    Jellyfin Server
                                </Text>
                                <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                                    Stream from your media server
                                </Text>
                            </View>
                            <Switch value={jellyfinEnabled} onValueChange={handleJellyfinToggle} />
                        </View>

                        {/* Expanded config - always rendered but hidden when disabled */}
                        <View
                            style={[
                                styles.expandedContent,
                                !jellyfinEnabled && { opacity: 0 }
                            ]}
                            pointerEvents={jellyfinEnabled ? 'auto' : 'none'}
                        >
                            {isAuthenticated ? (
                                // Already logged in
                                <View style={styles.loggedInContainer}>
                                    <View style={styles.connectedBadge}>
                                        <Check size={16} color={theme.colors.primary} />
                                        <Text variant="bodyMedium" style={{ color: theme.colors.primary, marginLeft: 8 }}>
                                            Connected as {user?.name}
                                        </Text>
                                    </View>
                                    <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 12 }}>
                                        Server: {serverUrl}
                                    </Text>

                                    {/* Music Library Selection */}
                                    {loadingLibraries ? (
                                        <View style={styles.libraryLoadingContainer}>
                                            <ActivityIndicator size="small" />
                                            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginLeft: 8 }}>
                                                Loading libraries...
                                            </Text>
                                        </View>
                                    ) : musicLibraries.length > 0 ? (
                                        <View style={styles.librarySection}>
                                            <View style={styles.librarySectionHeader}>
                                                <Library size={18} color={theme.colors.onSurfaceVariant} />
                                                <Text variant="labelLarge" style={{ color: theme.colors.onSurface, marginLeft: 8, flex: 1 }}>
                                                    Music Libraries
                                                </Text>
                                                <TouchableOpacity onPress={handleSelectAllLibraries}>
                                                    <Text variant="labelSmall" style={{ color: theme.colors.primary }}>
                                                        {selectedLibs.size === musicLibraries.length ? 'Deselect All' : 'Select All'}
                                                    </Text>
                                                </TouchableOpacity>
                                            </View>
                                            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 8 }}>
                                                {selectedLibs.size === 0
                                                    ? 'All libraries are included (none selected = all)'
                                                    : `${selectedLibs.size} of ${musicLibraries.length} selected`}
                                            </Text>
                                            {musicLibraries.map((library) => {
                                                const isSelected = selectedLibs.has(library.Id);
                                                return (
                                                    <TouchableOpacity
                                                        key={library.Id}
                                                        style={[
                                                            styles.libraryItem,
                                                            {
                                                                backgroundColor: isSelected
                                                                    ? theme.colors.primaryContainer
                                                                    : 'transparent',
                                                            }
                                                        ]}
                                                        onPress={() => handleLibraryToggle(library.Id)}
                                                    >
                                                        <Checkbox
                                                            status={isSelected ? 'checked' : 'unchecked'}
                                                            onPress={() => handleLibraryToggle(library.Id)}
                                                        />
                                                        <Text
                                                            variant="bodyMedium"
                                                            style={{
                                                                color: isSelected ? theme.colors.onPrimaryContainer : theme.colors.onSurface,
                                                                flex: 1,
                                                                fontWeight: isSelected ? '600' : '400',
                                                            }}
                                                        >
                                                            {library.Name}
                                                        </Text>
                                                    </TouchableOpacity>
                                                );
                                            })}
                                        </View>
                                    ) : (
                                        <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 12 }}>
                                            No music libraries found on this server.
                                        </Text>
                                    )}

                                    <Button mode="outlined" onPress={handleDisconnect} textColor={theme.colors.error}>
                                        Disconnect
                                    </Button>
                                </View>
                            ) : !serverConnected ? (
                                // Step 1: Enter server URL
                                <View>
                                    <TextInput
                                        label="Server URL"
                                        value={serverUrlInput}
                                        onChangeText={setServerUrlInput}
                                        mode="outlined"
                                        placeholder="e.g. 192.168.1.5:8096"
                                        autoCapitalize="none"
                                        keyboardType="url"
                                        style={styles.input}
                                        error={!!error}
                                    />
                                    {error ? <Text style={{ color: theme.colors.error, marginBottom: 8 }}>{error}</Text> : null}
                                    <Button
                                        mode="contained"
                                        onPress={handleConnectServer}
                                        loading={connecting}
                                        disabled={connecting || !serverUrlInput}
                                    >
                                        Connect
                                    </Button>

                                </View>
                            ) : (
                                // Step 2: Login
                                <View>
                                    <View style={styles.connectedBadge}>
                                        <Check size={16} color={theme.colors.primary} />
                                        <Text variant="bodySmall" style={{ color: theme.colors.primary, marginLeft: 8 }}>
                                            Server connected
                                        </Text>
                                    </View>
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
                                    {error ? <Text style={{ color: theme.colors.error, marginBottom: 8 }}>{error}</Text> : null}
                                    <Button
                                        mode="contained"
                                        onPress={handleLogin}
                                        loading={loggingIn}
                                        disabled={loggingIn || !username}
                                    >
                                        Log In
                                    </Button>
                                    <Button
                                        mode="outlined"
                                        onPress={handleStartQuickConnect}
                                        style={{ marginTop: 8 }}
                                    >
                                        Quick Connect
                                    </Button>
                                    <Button
                                        mode="text"
                                        onPress={() => { setServerConnected(false); setError(''); }}
                                        style={{ marginTop: 8 }}
                                    >
                                        Change Server
                                    </Button>
                                </View>
                            )}
                        </View>
                    </View>
                </SettingsGroup>

                {/* Local Music Card */}
                <SettingsGroup>
                    <View style={{ padding: 16 }}>
                        <View style={styles.cardHeader}>
                            <View style={[styles.iconContainer, { backgroundColor: theme.colors.surfaceVariant }]}>
                                <Smartphone size={24} color={theme.colors.onSurfaceVariant} />
                            </View>
                            <View style={styles.textContainer}>
                                <Text variant="titleMedium" style={{ fontWeight: '600', color: theme.colors.onSurface }}>
                                    Local Music
                                </Text>
                                <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                                    Play music from your device
                                </Text>
                            </View>
                            <Switch value={localEnabled} onValueChange={handleLocalToggle} />
                        </View>

                        {localEnabled && (
                            <View style={styles.expandedContent}>
                                <View style={styles.connectedBadge}>
                                    <Check size={16} color={theme.colors.primary} />
                                    <Text variant="bodySmall" style={{ color: theme.colors.primary, marginLeft: 8 }}>
                                        Ready to use
                                    </Text>
                                </View>
                                <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                                    Music will be scanned from your device storage.
                                </Text>
                            </View>
                        )}
                    </View>
                </SettingsGroup>

                {/* Hint for both */}
                {jellyfinEnabled && localEnabled && (
                    <Text
                        variant="bodySmall"
                        style={{
                            color: theme.colors.onSurfaceVariant,
                            textAlign: 'center',
                            marginTop: 8
                        }}
                    >
                        You can switch between sources using the toggle on the Home screen
                    </Text>
                )}

                {/* Warning if neither selected */}
                {!canSave && (
                    <View style={[styles.warningBadge, { backgroundColor: theme.colors.errorContainer }]}>
                        <AlertCircle size={16} color={theme.colors.error} />
                        <Text variant="bodySmall" style={{ color: theme.colors.error, marginLeft: 8 }}>
                            Please enable at least one source
                        </Text>
                    </View>
                )}
            </ScrollView>

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


            <View style={[styles.footer, { backgroundColor: theme.colors.background }]}>
                <Button
                    mode="contained"
                    onPress={handleSave}
                    disabled={!canSave}
                    style={styles.saveButton}
                    contentStyle={styles.saveButtonContent}
                >
                    Save Changes
                </Button>
            </View>
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
        marginBottom: 8,
        height: 56,
        minHeight: 56,
    },
    scrollContent: {
        paddingVertical: 16,
        paddingBottom: 120,
    },
    cardHeader: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    iconContainer: {
        width: 48,
        height: 48,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 12,
    },
    textContainer: {
        flex: 1,
    },
    expandedContent: {
        marginTop: 16,
        paddingTop: 16,
        borderTopWidth: 1,
        borderTopColor: 'rgba(255,255,255,0.1)',
    },
    input: {
        marginBottom: 12,
    },
    loggedInContainer: {
        alignItems: 'stretch',
    },
    connectedBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 8,
    },
    warningBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 12,
        borderRadius: 8,
        marginTop: 16,
    },
    footer: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        padding: 16,
        paddingBottom: 24,
    },
    saveButton: {
        borderRadius: 12,
    },
    saveButtonContent: {
        paddingVertical: 6,
    },
    libraryLoadingContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 12,
    },
    librarySection: {
        marginBottom: 16,
        padding: 12,
        borderRadius: 12,
        backgroundColor: 'rgba(255,255,255,0.05)',
        width: '100%',
    },
    librarySectionHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 8,
    },
    libraryItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 8,
        paddingHorizontal: 4,
        marginVertical: 2,
        borderRadius: 8,
    },
});
