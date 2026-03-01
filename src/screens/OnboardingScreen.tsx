import React, { useState, useRef } from 'react';
import { View, StyleSheet, ScrollView, useWindowDimensions, Animated } from 'react-native';
import { Text, Button, useTheme, Surface, TouchableRipple } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSettingsStore, SourceMode } from '../store/settingsStore';
import { Server, Smartphone, Check } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';

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

    const canContinue = jellyfinSelected || localSelected;

    const handleNextStep = () => {
        if (step === 0 && canContinue) {
            setStep(1);
            scrollViewRef.current?.scrollTo({ x: width, animated: true });
        }
    };

    const handlePrevStep = () => {
        if (step === 1) {
            setStep(0);
            scrollViewRef.current?.scrollTo({ x: 0, animated: true });
        }
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
        setOnboardingComplete(true);
    };

    const renderStepIndicators = () => (
        <View style={styles.indicatorContainer}>
            <View style={[styles.indicator, step === 0 ? { backgroundColor: theme.colors.primary, width: 24 } : { backgroundColor: theme.colors.surfaceVariant }]} />
            <View style={[styles.indicator, step === 1 ? { backgroundColor: theme.colors.primary, width: 24 } : { backgroundColor: theme.colors.surfaceVariant }]} />
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

                {/* Step 1: Confirmation */}
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
                                        ? "We'll connect to your Jellyfin server. You'll need to log in next."
                                        : "We'll scan your device for local music files."}
                            </Text>
                        </View>
                    </ScrollView>
                </View>
            </ScrollView>

            {/* Footer with Step Indicators & Buttons */}
            <View style={styles.footer}>
                {renderStepIndicators()}
                {step === 1 && (
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
                    onPress={step === 0 ? handleNextStep : handleFinish}
                    disabled={step === 0 && !canContinue}
                    style={styles.continueButton}
                    contentStyle={styles.continueButtonContent}
                    labelStyle={{ fontSize: 16, fontWeight: 'bold' }}
                >
                    {step === 0 ? 'Continue' : 'Let\'s Go!'}
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
});
