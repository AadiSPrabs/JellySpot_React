import React, { Component, ErrorInfo, ReactNode } from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { Text } from 'react-native-paper';
import { AlertTriangle, RotateCcw } from 'lucide-react-native';

interface Props {
    children: ReactNode;
}

interface State {
    hasError: boolean;
    error: Error | null;
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
        // Reset state and re-render children
        this.setState({ hasError: false, error: null });
    };

    render() {
        if (this.state.hasError) {
            return (
                <View style={styles.container}>
                    <AlertTriangle size={64} color="#FF6B6B" />
                    <Text variant="headlineMedium" style={styles.title}>
                        Something went wrong
                    </Text>
                    <Text variant="bodyMedium" style={styles.message}>
                        The app encountered an unexpected error. Please try restarting.
                    </Text>
                    {__DEV__ && this.state.error && (
                        <Text variant="bodySmall" style={styles.errorDetail}>
                            {this.state.error.message}
                        </Text>
                    )}
                    <TouchableOpacity
                        style={styles.button}
                        onPress={this.handleRestart}
                        activeOpacity={0.7}
                    >
                        <RotateCcw size={20} color="#FFFFFF" />
                        <Text variant="labelLarge" style={styles.buttonText}>
                            Try Again
                        </Text>
                    </TouchableOpacity>
                </View>
            );
        }

        return this.props.children;
    }
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#1C1B1F',
        padding: 32,
    },
    title: {
        color: '#E6E1E5',
        marginTop: 24,
        textAlign: 'center',
    },
    message: {
        color: '#CAC4D0',
        marginTop: 12,
        textAlign: 'center',
        lineHeight: 22,
    },
    errorDetail: {
        color: '#FF6B6B',
        marginTop: 16,
        padding: 12,
        backgroundColor: '#2D2D2D',
        borderRadius: 8,
        fontFamily: 'monospace',
        maxWidth: '100%',
    },
    button: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#4F378B',
        paddingHorizontal: 24,
        paddingVertical: 14,
        borderRadius: 28,
        marginTop: 32,
        gap: 8,
    },
    buttonText: {
        color: '#FFFFFF',
    },
});
