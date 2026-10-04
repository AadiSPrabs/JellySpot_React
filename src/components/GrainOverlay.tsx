import React from 'react';
import { View, StyleSheet } from 'react-native';

export default function GrainOverlay({ opacity = 0.4 }: { opacity?: number }) {
  return <View style={[StyleSheet.absoluteFill, { opacity: opacity * 0.08, backgroundColor: '#000' }]} pointerEvents="none" />;
}
