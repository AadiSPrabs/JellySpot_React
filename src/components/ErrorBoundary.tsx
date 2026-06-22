import React, { Component, ErrorInfo, ReactNode } from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { Text, useTheme } from 'react-native-paper';
import { AlertTriangle, RotateCcw } from 'lucide-react-native';

interface Props {
    children: ReactNode;
}

interface State {
    hasError: boolean;
    error: Error | null;
}

function ErrorScreen({ error, onRestart }: { error: Error | null; onRestart: () => void }) {
    const theme = useTheme();
    return (
        <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
            <AlertTriangle size={64} color={theme.colors.error} />
            <Text variant="headlineMedium" style={[styles.title, { color: theme.colors.onSurface }]}>
                Something went wrong
            </Text>
            <Text variant="bodyMedium" style={[styles.message, { color: theme.colors.onSurfaceVariant }]}>
                The app encountered an unexpected error. Please try restarting.
            </Text>
            {__DEV__ && error && (
                <Text variant="bodySmall" style={[styles.errorDetail, { color: theme.colors.error, backgroundColor: theme.colors.surfaceVariant }]}>
                    {error.message}
                </Text>
            )}
            <TouchableOpacity
                style={[styles.button, { backgroundColor: theme.colors.primary }]}
                onPress={onRestart}
                activeOpacity={0.7}
            >
                <RotateCcw size={20} color={theme.colors.onPrimary} />
                <Text variant="labelLarge" style={[styles.buttonText, { color: theme.colors.onPrimary }]}>
                    Try Again
                </Text>
            </TouchableOpacity>
        </View>
    );
}

export class ErrorBoundary extends Component<Props, State> {
    constructor(props: Props) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error('[ErrorBoundary] Uncaught error:', error, errorInfo);
    }

    handleRestart = () => {
        this.setState({ hasError: false, error: null });
    };

    render() {
        if (this.state.hasError) {
            return <ErrorScreen error={this.state.error} onRestart={this.handleRestart} />;
        }

        return this.props.children;
    }
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 32,
    },
    title: {
        marginTop: 24,
        textAlign: 'center',
    },
    message: {
        marginTop: 12,
        textAlign: 'center',
        lineHeight: 22,
    },
    errorDetail: {
        marginTop: 16,
        padding: 12,
        borderRadius: 8,
        fontFamily: 'monospace',
        maxWidth: '100%',
    },
    button: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 24,
        paddingVertical: 14,
        borderRadius: 28,
        marginTop: 32,
        gap: 8,
    },
    buttonText: {
    },
});
