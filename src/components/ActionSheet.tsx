import React, { useRef, useEffect, useState } from 'react';
import { View, StyleSheet, Animated, Dimensions, TouchableOpacity, PanResponder, StyleProp, ViewStyle, ScrollView, Platform, Keyboard, KeyboardEvent } from 'react-native';
import { Text, useTheme, Portal } from 'react-native-paper';
import { MaterialCommunityIcons as Icon } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

interface ActionSheetProps {
    visible: boolean;
    onClose: () => void;
    title?: string;
    children: React.ReactNode;
    backgroundColor?: string;
    heightPercentage?: number; // E.g., 50 for 50% of screen height
    scrollable?: boolean; // If true, wraps children in ScrollView
    style?: StyleProp<ViewStyle>;
}

export default function ActionSheet({
    visible,
    onClose,
    title,
    children,
    backgroundColor,
    heightPercentage = 50,
    scrollable = true,
    style
}: ActionSheetProps) {
    const theme = useTheme();
    const insets = useSafeAreaInsets();
    const translateY = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
    const keyboardOffset = useRef(new Animated.Value(0)).current;
    const isClosingRef = useRef(false);

    const sheetBgColor = backgroundColor || theme.colors.elevation.level2 || '#1e1e1e';
    const computedHeight = (SCREEN_HEIGHT * heightPercentage) / 100;

    // Animate in/out
    useEffect(() => {
        if (visible) {
            isClosingRef.current = false;
            Animated.spring(translateY, {
                toValue: 0,
                useNativeDriver: true,
                tension: 65,
                friction: 11,
            }).start();
        } else {
            // If visible prop becomes false externally, animate out
            if (!isClosingRef.current) {
                animateClose(false);
            }
        }
    }, [visible]);

    // Handle Keyboard Avoidance accurately
    useEffect(() => {
        const keyboardWillShowListener = Keyboard.addListener(
            Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
            (e: KeyboardEvent) => {
                Animated.timing(keyboardOffset, {
                    toValue: -e.endCoordinates.height,
                    duration: e.duration || 250,
                    useNativeDriver: true,
                }).start();
            }
        );

        const keyboardWillHideListener = Keyboard.addListener(
            Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
            (e: KeyboardEvent) => {
                Animated.timing(keyboardOffset, {
                    toValue: 0,
                    duration: e.duration || 250,
                    useNativeDriver: true,
                }).start();
            }
        );

        return () => {
            keyboardWillShowListener.remove();
            keyboardWillHideListener.remove();
        };
    }, []);

    // Smooth close animation
    const animateClose = (triggerOnClose = true) => {
        if (isClosingRef.current) return;
        isClosingRef.current = true;

        Animated.timing(translateY, {
            toValue: SCREEN_HEIGHT,
            duration: 250,
            useNativeDriver: true,
        }).start(() => {
            if (triggerOnClose) {
                onClose();
            }
        });
    };

    // Pan responder for drag-to-dismiss
    const panResponder = useRef(
        PanResponder.create({
            onStartShouldSetPanResponder: () => true,
            onMoveShouldSetPanResponderCapture: (_, gestureState) => {
                // Only capture vertical swipes that are distinct enough
                return Math.abs(gestureState.dy) > 10 && Math.abs(gestureState.vy) > Math.abs(gestureState.vx);
            },
            onMoveShouldSetPanResponder: (_, gestureState) => {
                return scrollable ? false : Math.abs(gestureState.dy) > 10;
            },
            onPanResponderMove: (_, gestureState) => {
                if (gestureState.dy > 0) {
                    translateY.setValue(gestureState.dy);
                }
            },
            onPanResponderRelease: (_, gestureState) => {
                if (gestureState.dy > SCREEN_HEIGHT * 0.15 || gestureState.vy > 0.5) {
                    // Continue sliding down smoothly before closing
                    animateClose();
                } else {
                    // Snap back up
                    Animated.spring(translateY, {
                        toValue: 0,
                        useNativeDriver: true,
                        tension: 65,
                        friction: 11,
                    }).start();
                }
            },
        })
    ).current;

    // Only render the Portal if it's visible or currently animating closed
    if (!visible && isClosingRef.current) return null;

    const ContentWrapper = scrollable ? ScrollView : View;

    return (
        <Portal>
            <View
                style={[StyleSheet.absoluteFill, { zIndex: 999 }]}
                pointerEvents={visible ? "auto" : "none"}
            >
                {/* Backdrop - only fade in when visible, and fade out when closing */}
                <Animated.View style={[StyleSheet.absoluteFill, {
                    backgroundColor: 'rgba(0, 0, 0, 0.65)',
                    opacity: translateY.interpolate({
                        inputRange: [0, SCREEN_HEIGHT],
                        outputRange: [1, 0],
                        extrapolate: 'clamp'
                    })
                }]}>
                    <TouchableOpacity
                        style={StyleSheet.absoluteFill}
                        activeOpacity={1}
                        onPress={() => {
                            Keyboard.dismiss();
                            animateClose();
                        }}
                    />
                </Animated.View>

                {/* Bottom Sheet */}
                <Animated.View
                    style={[
                        styles.sheetContainer,
                        {
                            backgroundColor: sheetBgColor,
                            height: computedHeight,
                            transform: [{ translateY: Animated.add(translateY, keyboardOffset) }],
                            paddingBottom: insets.bottom || 24, // Add safe area padding to bottom
                        },
                        style
                    ]}
                >
                    {/* Drag handle area (intercepts touches) */}
                    <View {...panResponder.panHandlers} style={styles.headerArea}>
                        <View style={styles.dragPill} />
                        {title && (
                            <View style={styles.titleRow}>
                                <Text variant="titleMedium" style={styles.titleText} numberOfLines={1}>{title}</Text>
                                <TouchableOpacity onPress={() => animateClose()} style={styles.closeButton} hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}>
                                    <Icon name="close" size={24} color={theme.colors.onSurfaceVariant} />
                                </TouchableOpacity>
                            </View>
                        )}
                    </View>

                    {/* Content */}
                    <ContentWrapper
                        style={styles.contentContainer}
                        contentContainerStyle={scrollable ? styles.scrollContent : undefined}
                        showsVerticalScrollIndicator={false}
                        keyboardShouldPersistTaps="handled"
                    >
                        {children}
                    </ContentWrapper>
                </Animated.View>
            </View>
        </Portal>
    );
}

const styles = StyleSheet.create({
    backdrop: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0, 0, 0, 0.65)',
    },
    sheetContainer: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        borderTopLeftRadius: 28,
        borderTopRightRadius: 28,
        elevation: 16,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.1,
        shadowRadius: 10,
        overflow: 'hidden',
    },
    headerArea: {
        paddingTop: 12,
        paddingHorizontal: 20,
        paddingBottom: 8,
        alignItems: 'center',
    },
    dragPill: {
        width: 36,
        height: 5,
        borderRadius: 3,
        backgroundColor: 'rgba(255, 255, 255, 0.3)',
        marginBottom: 16,
    },
    titleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        width: '100%',
        marginBottom: 4,
    },
    titleText: {
        fontWeight: 'bold',
        flex: 1,
    },
    closeButton: {
        padding: 4,
        marginLeft: 16,
        backgroundColor: 'rgba(255, 255, 255, 0.1)',
        borderRadius: 20,
    },
    contentContainer: {
        flex: 1,
    },
    scrollContent: {
        paddingHorizontal: 16,
        paddingBottom: 24,
    }
});
