import React, { useRef, useEffect } from 'react';
import { View, StyleSheet, Animated, Dimensions, TouchableOpacity, PanResponder, Text as RNText } from 'react-native';
import { Image } from 'expo-image';
import { Text, useTheme } from 'react-native-paper';
import { usePlayerStore } from '../store/playerStore';
import { useShallow } from 'zustand/react/shallow';
import DraggableFlatList, { RenderItemParams } from 'react-native-draggable-flatlist';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { MaterialCommunityIcons as Icon } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

interface QueueBottomSheetProps {
    visible: boolean;
    onClose: () => void;
    activeColor?: string;
    backgroundColor?: string;
}

// Ultra-lightweight item component for maximum performance
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
        delayLongPress={150}
        activeOpacity={0.6}
        accessibilityRole="button"
        accessibilityLabel={`Play ${item.name} by ${item.artist}${isCurrent ? ', currently playing' : ''}. Double tap and hold to reorder.`}
    >
        {/* Drag handle */}
        <View style={styles.dragHandleContainer}>
            <Icon
                name="drag-horizontal-variant"
                size={22}
                color={theme.colors.onSurfaceVariant}
            />
        </View>

        {/* Track image */}
        <Image
            source={{ uri: item.imageUrl }}
            style={styles.queueImage}
        />

        {/* Track info */}
        <View style={styles.trackInfo}>
            <Text
                style={[
                    styles.trackName,
                    { color: isCurrent ? themeActiveColor : theme.colors.onSurface }
                ]}
                numberOfLines={1}
            >
                {item.name}
            </Text>
            <Text
                style={[styles.trackArtist, { color: theme.colors.onSurfaceVariant }]}
                numberOfLines={1}
            >
                {item.artist}
            </Text>
        </View>

        {/* Simple playing indicator - just a colored dot, no animation */}
        {isCurrent && (
            <View style={[styles.playingDot, { backgroundColor: themeActiveColor }]} />
        )}

        {/* Delete button */}
        <TouchableOpacity
            style={styles.deleteButton}
            onPress={() => onRemove(item.queueItemId || item.id)}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityRole="button"
            accessibilityLabel={`Remove ${item.name} from queue`}
        >
            <Icon name="close" size={20} color={theme.colors.onSurfaceVariant} />
        </TouchableOpacity>
    </TouchableOpacity>
), (prev, next) => (
    (prev.item.queueItemId === next.item.queueItemId || prev.item.id === next.item.id) &&
    prev.isActive === next.isActive &&
    prev.isCurrent === next.isCurrent
));

export default function QueueBottomSheet({
    visible,
    onClose,
    activeColor,
    backgroundColor = '#1a1a1a'
}: QueueBottomSheetProps) {
    const theme = useTheme();
    const translateY = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
    const isClosingRef = useRef(false);
    const listRef = useRef<any>(null);

    const { queue, currentTrack, isPlaying, playTrack, reorderQueue, removeFromQueue, clearQueue } = usePlayerStore(useShallow(state => ({
        queue: state.queue,
        currentTrack: state.currentTrack,
        isPlaying: state.isPlaying,
        playTrack: state.playTrack,
        reorderQueue: state.reorderQueue,
        removeFromQueue: state.removeFromQueue,
        clearQueue: state.clearQueue,
    })));

    const themeActiveColor = activeColor || theme.colors.primary;

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

            // Scroll to current track after animation starts
            if (currentTrack && queue.length > 0) {
                const currentIndex = queue.findIndex(t => t.id === currentTrack.id);
                if (currentIndex >= 0 && listRef.current) {
                    // Small timeout to ensure list layout happens first
                    setTimeout(() => {
                        listRef.current?.scrollToIndex({
                            index: currentIndex,
                            animated: false,
                            viewPosition: 0.1 // Shows a bit of the previous track for context
                        });
                    }, 50);
                }
            }
        }
    }, [visible, currentTrack, queue]);

    // Smooth close animation - animates fully then calls onClose
    const animateClose = () => {
        if (isClosingRef.current) return;
        isClosingRef.current = true;

        Animated.timing(translateY, {
            toValue: SCREEN_HEIGHT,
            duration: 300,
            useNativeDriver: true,
        }).start(() => {
            onClose();
        });
    };

    // Pan responder for drag-to-dismiss
    const panResponder = useRef(
        PanResponder.create({
            onStartShouldSetPanResponder: () => true,
            onMoveShouldSetPanResponder: (_, gestureState) => {
                return Math.abs(gestureState.dy) > 10;
            },
            onPanResponderMove: (_, gestureState) => {
                if (gestureState.dy > 0) {
                    translateY.setValue(gestureState.dy);
                }
            },
            onPanResponderRelease: (_, gestureState) => {
                if (gestureState.dy > 100 || gestureState.vy > 0.5) {
                    // Continue sliding down smoothly before closing
                    animateClose();
                } else {
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

    // Handle drag end - reorder queue
    const handleDragEnd = ({ from, to }: { from: number; to: number }) => {
        if (from !== to) {
            reorderQueue(from, to);
        }
    };

    const renderItem = React.useCallback(({ item, drag, isActive, getIndex }: RenderItemParams<any>) => {
        const isCurrent = item.id === currentTrack?.id;

        return (
            <QueueItem
                item={item}
                drag={drag}
                isActive={isActive}
                isCurrent={isCurrent}
                themeActiveColor={themeActiveColor}
                theme={theme}
                onPress={playTrack}
                onRemove={removeFromQueue} // QueueItem needs to pass the queueItemId now
            />
        );
    }, [currentTrack?.id, themeActiveColor, theme, playTrack, removeFromQueue]);

    const keyExtractor = React.useCallback((item: any, index: number) => item.queueItemId || `${item.id}-${index}`, []);

    const hasRenderedRef = useRef(false);
    if (visible && !hasRenderedRef.current) {
        hasRenderedRef.current = true;
    }

    if (!hasRenderedRef.current) return null;

    return (
        <Animated.View
            pointerEvents={visible ? 'auto' : 'none'}
            style={[
                styles.container,
                {
                    backgroundColor,
                    transform: [{ translateY }]
                }
            ]}
        >
            {/* Drag handle bar */}
            <View {...panResponder.panHandlers} style={styles.handleContainer}>
                <View style={styles.handleBar} />
                <Text variant="titleMedium" style={[styles.title, { color: theme.colors.onSurface }]}>
                    Queue ({queue.length} tracks)
                </Text>
            </View>

            {/* Queue list with drag-to-reorder */}
            <View style={{ flex: 1, overflow: 'hidden' }}>
                <GestureHandlerRootView style={{ flex: 1 }}>
                    <DraggableFlatList
                        ref={listRef}
                        data={queue}
                        renderItem={renderItem}
                        keyExtractor={keyExtractor}
                        onDragEnd={handleDragEnd}
                        contentContainerStyle={styles.listContent}
                        showsVerticalScrollIndicator={false}
                        initialNumToRender={10}
                        maxToRenderPerBatch={8}
                        updateCellsBatchingPeriod={50}
                        windowSize={11}
                        removeClippedSubviews={true}
                        getItemLayout={(data, index) => ({ length: 64, offset: 64 * index, index })}
                        activationDistance={10}
                        autoscrollThreshold={60}
                        autoscrollSpeed={150}
                        dragItemOverflow={false} // Overflow can cause layout thrashing
                    />
                </GestureHandlerRootView>
            </View>

            {/* Clear Queue Footer */}
            <View style={styles.footer}>
                <TouchableOpacity
                    style={[styles.clearButton, { borderColor: theme.colors.error }]}
                    onPress={clearQueue}
                    accessibilityRole="button"
                    accessibilityLabel="Clear entire queue"
                >
                    <Icon name="playlist-remove" size={18} color={theme.colors.error} />
                    <RNText style={[styles.clearButtonText, { color: theme.colors.error }]}>
                        Clear Queue
                    </RNText>
                </TouchableOpacity>
            </View>
        </Animated.View>
    );
}

const styles = StyleSheet.create({
    container: {
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        top: 60,
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        elevation: 10,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -3 },
        shadowOpacity: 0.3,
        shadowRadius: 4,
        overflow: 'hidden', // Critical for autoscroll boundary detection
    },
    handleContainer: {
        alignItems: 'center',
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255,255,255,0.1)',
    },
    handleBar: {
        width: 40,
        height: 4,
        backgroundColor: 'rgba(255,255,255,0.5)',
        borderRadius: 2,
        marginBottom: 12,
    },
    title: {
        fontWeight: 'bold',
    },
    listContent: {
        padding: 16,
        paddingBottom: 100,
    },
    queueItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 6,
        paddingRight: 8,
        borderRadius: 8,
        marginBottom: 2,
        height: 64,
    },
    dragHandleContainer: {
        paddingHorizontal: 6,
        paddingVertical: 10,
    },
    queueImage: {
        width: 44,
        height: 44,
        borderRadius: 4,
        marginRight: 10,
        backgroundColor: '#333',
    },
    trackInfo: {
        flex: 1,
        justifyContent: 'center',
    },
    trackName: {
        fontSize: 14,
        fontWeight: '500',
    },
    trackArtist: {
        fontSize: 12,
        marginTop: 2,
    },
    playingDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        marginHorizontal: 8,
    },
    deleteButton: {
        padding: 8,
    },
    deleteAction: {
        backgroundColor: '#d32f2f',
        justifyContent: 'center',
        alignItems: 'center',
        width: 70,
        height: '100%',
        borderRadius: 8,
        marginBottom: 4,
    },
    footer: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        paddingHorizontal: 16,
        paddingVertical: 12,
        paddingBottom: 24,
        backgroundColor: 'transparent',
    },
    clearButton: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 10,
        paddingHorizontal: 16,
        borderRadius: 8,
        alignSelf: 'flex-start',
        backgroundColor: '#d32f2f',
    },
    clearButtonText: {
        fontSize: 14,
        fontWeight: '500',
        marginLeft: 8,
    },
});
