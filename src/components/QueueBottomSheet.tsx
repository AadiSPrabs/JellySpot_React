import React, { useRef, useEffect, useCallback } from 'react';
import { View, StyleSheet, Dimensions, TouchableOpacity, Text as RNText, Platform, ActivityIndicator } from 'react-native';
import { Image } from 'expo-image';
import { Text, useTheme } from 'react-native-paper';
import { usePlayerStore } from '../store/playerStore';
import { useShallow } from 'zustand/react/shallow';
import DraggableFlatList, { RenderItemParams } from 'react-native-draggable-flatlist';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withSpring,
    withTiming,
    runOnJS,
    interpolate,
    Extrapolate
} from 'react-native-reanimated';
import { MaterialCommunityIcons as Icon } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

interface QueueBottomSheetProps {
    visible: boolean;
    onClose: () => void;
    activeColor?: string;
    backgroundColor?: string;
}

// Optimized QueueItem
const QueueItem = React.memo(({
    item,
    drag,
    isActive,
    isCurrent,
    themeActiveColor,
    theme,
    onPress,
    onRemove
}: {
    item: any,
    drag: () => void,
    isActive: boolean,
    isCurrent: boolean,
    themeActiveColor: string,
    theme: any,
    onPress: (item: any) => void,
    onRemove: (id: string) => void
}) => (
    <TouchableOpacity
        style={[
            styles.queueItem,
            isCurrent && { backgroundColor: `${themeActiveColor}20` },
            isActive && { backgroundColor: `${themeActiveColor}30` }
        ]}
        onPress={() => onPress(item)}
        onLongPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            drag();
        }}
        delayLongPress={200} // Slightly more for accidental drag prevention
        activeOpacity={0.7}
    >
        <View style={styles.dragHandleContainer}>
            <Icon name="drag" size={24} color={theme.colors.onSurfaceVariant} />
        </View>

        <Image source={{ uri: item.imageUrl }} style={styles.queueImage} />

        <View style={styles.trackInfo}>
            <Text style={[styles.trackName, { color: isCurrent ? themeActiveColor : theme.colors.onSurface }]} numberOfLines={1}>
                {item.name}
            </Text>
            <Text style={[styles.trackArtist, { color: theme.colors.onSurfaceVariant }]} numberOfLines={1}>
                {item.artist}
            </Text>
        </View>

        {isCurrent && <View style={[styles.playingDot, { backgroundColor: themeActiveColor }]} />}

        <TouchableOpacity
            style={styles.deleteButton}
            onPress={() => onRemove(item.queueItemId || item.id)}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
            <Icon name="close" size={20} color={theme.colors.onSurfaceVariant} />
        </TouchableOpacity>
    </TouchableOpacity>
), (prev, next) => (
    (prev.item.queueItemId === next.item.queueItemId || prev.item.id === next.item.id) &&
    prev.isActive === next.isActive &&
    prev.isCurrent === next.isCurrent &&
    prev.themeActiveColor === next.themeActiveColor
));

export default function QueueBottomSheet({
    visible,
    onClose,
    activeColor,
    backgroundColor = '#1a1a1a'
}: QueueBottomSheetProps) {
    const theme = useTheme();
    const listRef = useRef<any>(null);
    const hasScrolledRef = useRef(false);

    // Reanimated values for native thread movement
    const translateY = useSharedValue(SCREEN_HEIGHT);
    const contextY = useSharedValue(0);

    const { queue, currentTrack, playTrack, reorderQueue, removeFromQueue, clearQueue } = usePlayerStore(useShallow(state => ({
        queue: state.queue,
        currentTrack: state.currentTrack,
        playTrack: state.playTrack,
        reorderQueue: state.reorderQueue,
        removeFromQueue: state.removeFromQueue,
        clearQueue: state.clearQueue,
    })));

    const themeActiveColor = activeColor || theme.colors.primary;

    const [isAnimationComplete, setIsAnimationComplete] = React.useState(false);
    const [listReady, setListReady] = React.useState(false);

    // Visibility control
    useEffect(() => {
        if (visible) {
            translateY.value = withTiming(0, { duration: 300 }, () => {
                runOnJS(setIsAnimationComplete)(true);
            });
            hasScrolledRef.current = false; // Allow one scroll when opened
        } else {
            setIsAnimationComplete(false); // Unmount heavy list before animating down
            setListReady(false); // Reset ready state
            translateY.value = withTiming(SCREEN_HEIGHT, { duration: 300 });
        }
    }, [visible]);

    // Handle scroll to current track silently while list is hidden
    useEffect(() => {
        if (isAnimationComplete && !hasScrolledRef.current && currentTrack && queue.length > 0) {
            const currentIndex = queue.findIndex(t => t.id === currentTrack.id);
            if (currentIndex >= 0 && listRef.current) {
                // Give DraggableFlatList 50ms to mount its children at top
                const mountTimer = setTimeout(() => {
                    try {
                        listRef.current?.scrollToIndex({
                            index: currentIndex,
                            animated: false,
                            viewPosition: 0.1
                        });
                    } catch (e) {
                        console.log('Scroll to index failed gracefully');
                    }

                    // Wait 100ms for the native UI to instantly jump, then show the list
                    const revealTimer = setTimeout(() => {
                        setListReady(true);
                        hasScrolledRef.current = true;
                    }, 100);
                }, 50);

                return () => clearTimeout(mountTimer);
            } else {
                setListReady(true);
            }
        } else if (isAnimationComplete && (!currentTrack || queue.length === 0)) {
            setListReady(true);
        }
    }, [isAnimationComplete, currentTrack?.id, queue.length]);

    const animateClose = useCallback(() => {
        translateY.value = withTiming(SCREEN_HEIGHT, { duration: 250 }, () => {
            runOnJS(onClose)();
        });
    }, [onClose]);

    // Native Gesture for the handle
    const panGesture = Gesture.Pan()
        .onStart(() => {
            contextY.value = translateY.value;
        })
        .onUpdate((event) => {
            if (event.translationY > 0) {
                translateY.value = contextY.value + event.translationY;
            }
        })
        .onEnd((event) => {
            if (event.translationY > 100 || event.velocityY > 500) {
                runOnJS(animateClose)();
            } else {
                translateY.value = withTiming(0, { duration: 250 });
            }
        });

    const animatedStyle = useAnimatedStyle(() => ({
        transform: [{ translateY: translateY.value }]
    }));

    const backdropStyle = useAnimatedStyle(() => ({
        opacity: interpolate(translateY.value, [0, SCREEN_HEIGHT], [1, 0], Extrapolate.CLAMP)
    }));

    const listOpacityStyle = useAnimatedStyle(() => ({
        opacity: withTiming(listReady ? 1 : 0, { duration: 200 })
    }));

    const renderItem = useCallback(({ item, drag, isActive }: RenderItemParams<any>) => (
        <QueueItem
            item={item}
            drag={drag}
            isActive={isActive}
            isCurrent={item.id === currentTrack?.id}
            themeActiveColor={themeActiveColor}
            theme={theme}
            onPress={playTrack}
            onRemove={removeFromQueue}
        />
    ), [currentTrack?.id, themeActiveColor, theme, playTrack, removeFromQueue]);

    const handleDragEnd = useCallback(({ from, to }: { from: number, to: number }) => {
        if (from !== to) reorderQueue(from, to);
    }, [reorderQueue]);

    const keyExtractor = useCallback((item: any, index: number) => item.queueItemId || item.id, []);

    // Only render if visible or in transition to prevent background overhead
    const [shouldRender, setShouldRender] = React.useState(visible);
    useEffect(() => {
        if (visible) setShouldRender(true);
        else {
            const timer = setTimeout(() => setShouldRender(false), 400);
            return () => clearTimeout(timer);
        }
    }, [visible]);

    if (!shouldRender) return null;

    return (
        <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
            {/* Backdrop catches taps to close */}
            <Animated.View
                style={[styles.backdrop, backdropStyle]}
                pointerEvents={visible ? 'auto' : 'none'}
            >
                <TouchableOpacity
                    style={{ flex: 1 }}
                    onPress={animateClose}
                    activeOpacity={1}
                />
            </Animated.View>

            <Animated.View
                style={[
                    styles.container,
                    { backgroundColor },
                    animatedStyle
                ]}
            >
                <View style={{ flex: 1 }}>
                    {/* Drag handle area - wider hit slop for better swipe */}
                    <GestureDetector gesture={panGesture}>
                        <View style={styles.handleContainer}>
                            <View style={styles.handleBar} />
                            <Text variant="titleMedium" style={[styles.title, { color: theme.colors.onSurface }]}>
                                Queue ({queue.length})
                            </Text>
                        </View>
                    </GestureDetector>

                    <View style={styles.listWrapper}>
                        {isAnimationComplete ? (
                            <View style={{ flex: 1 }}>
                                {/* Heavy list is mounted immediately but stays invisible (opacity 0) until properly scrolled */}
                                <Animated.View style={[{ flex: 1 }, listOpacityStyle]}>
                                    <DraggableFlatList
                                        ref={listRef}
                                        data={queue}
                                        renderItem={renderItem}
                                        keyExtractor={keyExtractor}
                                        onDragEnd={handleDragEnd}
                                        contentContainerStyle={styles.listContent}
                                        showsVerticalScrollIndicator={true}
                                        initialNumToRender={8}
                                        maxToRenderPerBatch={8}
                                        windowSize={11}
                                        removeClippedSubviews={true} // CRITICAL for large queues
                                        getItemLayout={(data, index) => ({ length: 64, offset: 64 * index, index })}
                                        activationDistance={25}
                                        dragItemOverflow={false}
                                    />
                                </Animated.View>

                                {/* Keep indicator on top until silent scroll finishes */}
                                {!listReady && (
                                    <View style={[StyleSheet.absoluteFill, { justifyContent: 'center', alignItems: 'center' }]}>
                                        <ActivityIndicator size="small" color={theme.colors.primary} />
                                    </View>
                                )}
                            </View>
                        ) : (
                            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                                <ActivityIndicator size="small" color={theme.colors.primary} />
                            </View>
                        )}
                    </View>

                    {/* Footer Actions */}
                    <View style={styles.footer}>
                        <TouchableOpacity
                            style={[styles.actionButton, { backgroundColor: theme.colors.surfaceVariant }]}
                            onPress={animateClose}
                        >
                            <Icon name="chevron-down" size={24} color={theme.colors.onSurface} />
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={[styles.actionButton, { backgroundColor: theme.colors.surfaceVariant, paddingHorizontal: 20 }]}
                            onPress={() => {
                                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
                                clearQueue();
                            }}
                        >
                            <Icon name="playlist-remove" size={20} color={theme.colors.error} />
                            <RNText style={[styles.actionButtonText, { color: theme.colors.error }]}>Clear Queue</RNText>
                        </TouchableOpacity>
                    </View>
                </View>
            </Animated.View>
        </View>
    );
}

const styles = StyleSheet.create({
    backdrop: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.5)',
    },
    container: {
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        top: 60,
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        elevation: 20,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.4,
        shadowRadius: 6,
        overflow: 'hidden',
    },
    handleContainer: {
        alignItems: 'center',
        paddingVertical: 12,
        backgroundColor: 'transparent',
    },
    handleBar: {
        width: 36,
        height: 4,
        backgroundColor: 'rgba(255,255,255,0.3)',
        borderRadius: 2,
        marginBottom: 8,
    },
    title: {
        fontWeight: '700',
        letterSpacing: 0.5,
    },
    listWrapper: {
        flex: 1,
    },
    listContent: {
        paddingHorizontal: 16,
        paddingBottom: 100,
    },
    queueItem: {
        flexDirection: 'row',
        alignItems: 'center',
        height: 64,
        borderRadius: 12,
        marginBottom: 4,
        paddingRight: 8,
    },
    dragHandleContainer: {
        paddingHorizontal: 12,
        opacity: 0.5,
    },
    queueImage: {
        width: 44,
        height: 44,
        borderRadius: 6,
        marginRight: 12,
        backgroundColor: '#2a2a2a',
    },
    trackInfo: {
        flex: 1,
        justifyContent: 'center',
    },
    trackName: {
        fontSize: 15,
        fontWeight: '600',
    },
    trackArtist: {
        fontSize: 12,
        marginTop: 2,
        opacity: 0.7,
    },
    playingDot: {
        width: 6,
        height: 6,
        borderRadius: 3,
        marginHorizontal: 12,
    },
    deleteButton: {
        padding: 10,
        opacity: 0.6,
    },
    footer: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingTop: 12,
        paddingBottom: Platform.OS === 'ios' ? 40 : 24,
        backgroundColor: '#1a1a1a',
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: 'rgba(255,255,255,0.1)',
        elevation: 10,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -2 },
        shadowOpacity: 0.3,
        shadowRadius: 4,
    },
    actionButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 12,
        paddingHorizontal: 16,
        borderRadius: 12,
    },
    actionButtonText: {
        fontSize: 15,
        fontWeight: 'bold',
        marginLeft: 8,
    },
});
