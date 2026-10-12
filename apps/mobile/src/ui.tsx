import React from 'react';
import { Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native';
export const palette = {
  ink: '#171717',
  muted: '#8a8a8a',
  secondary: '#626262',
  line: '#ededed',
  soft: '#f5f5f5',
  error: '#a33b32',
  white: '#ffffff',
};
export function Button({
  label,
  onPress,
  disabled,
  subtle,
  style,
  accessibilityLabel,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  subtle?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        subtle && styles.subtle,
        disabled && { opacity: 0.4 },
        pressed && { opacity: 0.7 },
        style,
      ]}
    >
      <Text style={[styles.buttonText, subtle && { color: palette.ink }]}>{label}</Text>
    </Pressable>
  );
}
export const common = StyleSheet.create({
  page: { flex: 1, backgroundColor: palette.white },
  content: { width: '100%', maxWidth: 760, alignSelf: 'center', paddingHorizontal: 24 },
  title: { fontSize: 34, lineHeight: 42, fontWeight: '700', color: palette.ink, letterSpacing: -1 },
  subtitle: { fontSize: 14, lineHeight: 22, color: palette.muted, marginTop: 9 },
  label: { fontSize: 13, color: palette.secondary, marginBottom: 10 },
  field: {
    minHeight: 48,
    fontSize: 16,
    color: palette.ink,
    paddingVertical: 12,
    paddingHorizontal: 0,
    borderBottomWidth: 1,
    borderBottomColor: '#dcdcdc',
  },
  error: { color: palette.error, fontSize: 13, lineHeight: 21 },
});
const styles = StyleSheet.create({
  button: {
    backgroundColor: palette.ink,
    paddingHorizontal: 21,
    paddingVertical: 15,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 9,
  },
  subtle: { backgroundColor: 'transparent' },
  buttonText: { color: 'white', fontSize: 15, fontWeight: '500' },
});
