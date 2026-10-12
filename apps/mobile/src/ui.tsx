import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, Appearance, Platform, Pressable, StyleSheet, Text, View, useColorScheme,
  type StyleProp, type ViewStyle,
} from 'react-native';
import * as SystemUI from 'expo-system-ui';
import { readCache, saveCache } from './storage';
import { DEFAULT_PREFERENCES, FONT_SIZES, PREFERENCES_KEY, normalizePreferences, type Preferences } from './preferences';

const lightPalette = {
  ink: '#171717', muted: '#777777', secondary: '#626262', line: '#e5e5e5',
  soft: '#f5f5f5', error: '#a33b32', background: '#ffffff', onInk: '#ffffff',
  link: '#2563a6', code: '#303030',
};
export type Palette = typeof lightPalette;
const darkPalette: Palette = {
  ink: '#f0f0f0', muted: '#a0a0a0', secondary: '#bbbbbb', line: '#383838',
  soft: '#262626', error: '#ffaaa0', background: '#121212', onInk: '#171717',
  link: '#8bbcff', code: '#dddddd',
};

export function scaleTextStyles<T extends StyleSheet.NamedStyles<T>>(styles: T, scale: number): T {
  return Object.fromEntries(Object.entries(styles).map(([key, value]) => {
    const style = value as { fontSize?: number; lineHeight?: number };
    return [key, {
      ...style,
      ...(typeof style.fontSize === 'number' && { fontSize: style.fontSize * scale }),
      ...(typeof style.lineHeight === 'number' && { lineHeight: style.lineHeight * scale }),
    }];
  })) as T;
}
const commonStyles = (palette: Palette) => StyleSheet.create({
  page: { flex: 1, backgroundColor: palette.background },
  content: { width: '100%', maxWidth: 760, alignSelf: 'center', paddingHorizontal: 24 },
  title: { fontSize: 34, lineHeight: 42, fontWeight: '700', color: palette.ink, letterSpacing: -1 },
  subtitle: { fontSize: 14, lineHeight: 22, color: palette.muted, marginTop: 9 },
  label: { fontSize: 13, color: palette.secondary, marginBottom: 10 },
  field: {
    minHeight: 48, fontSize: 16, color: palette.ink, paddingVertical: 12,
    paddingHorizontal: 0, borderBottomWidth: 1, borderBottomColor: palette.line,
  },
  error: { color: palette.error, fontSize: 13, lineHeight: 21 },
});
type UI = {
  palette: Palette;
  scheme: 'light' | 'dark';
  fontScale: number;
  common: ReturnType<typeof commonStyles>;
};
const UIContext = createContext<UI | null>(null);
const PreferencesContext = createContext<{
  preferences: Preferences;
  updatePreferences: (change: Partial<Preferences>) => void;
  saveError: string;
} | null>(null);

export function UIProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme();
  const [preferences, setPreferences] = useState(DEFAULT_PREFERENCES);
  const [loaded, setLoaded] = useState(false);
  const [saveError, setSaveError] = useState('');
  const pendingSave = useRef(Promise.resolve());
  useEffect(() => {
    let alive = true;
    void readCache<unknown>(PREFERENCES_KEY).then((saved) => {
      if (alive) setPreferences(normalizePreferences(saved));
    }).catch(() => {}).finally(() => { if (alive) setLoaded(true); });
    return () => { alive = false; };
  }, []);
  useEffect(() => {
    if (!loaded) return;
    pendingSave.current = pendingSave.current.then(() => saveCache(PREFERENCES_KEY, preferences))
      .then(() => setSaveError('')).catch(() => setSaveError('通用设置保存失败，请重试。'));
  }, [loaded, preferences]);
  const scheme = preferences.theme === 'system' ? (systemScheme ?? 'light') : preferences.theme;
  const palette = scheme === 'dark' ? darkPalette : lightPalette;
  const fontScale = FONT_SIZES[preferences.fontSize];
  const ui = useMemo(() => ({
    palette, scheme, fontScale, common: scaleTextStyles(commonStyles(palette), fontScale),
  }), [palette, scheme, fontScale]);
  useEffect(() => {
    if (!loaded) return;
    if (Platform.OS === 'web') {
      document.documentElement.style.colorScheme = scheme;
      document.body.style.backgroundColor = palette.background;
    } else {
      Appearance.setColorScheme(preferences.theme === 'system' ? null : preferences.theme);
      void SystemUI.setBackgroundColorAsync(palette.background).catch(() => {});
    }
  }, [loaded, scheme, palette, preferences.theme]);
  const updatePreferences = useCallback((change: Partial<Preferences>) => {
    setPreferences((previous) => normalizePreferences({ ...previous, ...change }));
  }, []);
  const settings = useMemo(() => ({ preferences, updatePreferences, saveError }), [preferences, updatePreferences, saveError]);
  return (
    <UIContext.Provider value={ui}>
      <PreferencesContext.Provider value={settings}>
        {loaded ? children : (
          <View style={{ flex: 1, justifyContent: 'center', backgroundColor: palette.background }}>
            <ActivityIndicator color={palette.ink} />
          </View>
        )}
      </PreferencesContext.Provider>
    </UIContext.Provider>
  );
}
export function useUI() {
  const value = useContext(UIContext);
  if (!value) throw new Error('UIProvider is required');
  return value;
}
export function usePreferences() {
  const value = useContext(PreferencesContext);
  if (!value) throw new Error('UIProvider is required');
  return value;
}
export function useThemedStyles<T extends StyleSheet.NamedStyles<T>>(factory: (palette: Palette) => T): T {
  const { palette, fontScale } = useUI();
  return useMemo(() => scaleTextStyles(factory(palette), fontScale), [factory, palette, fontScale]);
}
export function Button({ label, onPress, disabled, subtle, style, accessibilityLabel }: {
  label: string; onPress: () => void; disabled?: boolean; subtle?: boolean;
  style?: StyleProp<ViewStyle>; accessibilityLabel?: string;
}) {
  const { palette } = useUI();
  const styles = useThemedStyles(buttonStyles);
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? label}
      disabled={disabled} onPress={onPress}
      style={({ pressed }) => [styles.button, subtle && styles.subtle,
        disabled && { opacity: 0.4 }, pressed && { opacity: 0.7 }, style]}>
      <Text style={[styles.buttonText, subtle && { color: palette.ink }]}>{label}</Text>
    </Pressable>
  );
}
const buttonStyles = (palette: Palette) => StyleSheet.create({
  button: {
    backgroundColor: palette.ink, paddingHorizontal: 21, paddingVertical: 15, minHeight: 48,
    alignItems: 'center', justifyContent: 'center', borderRadius: 9,
  },
  subtle: { backgroundColor: 'transparent' },
  buttonText: { color: palette.onInk, fontSize: 15, fontWeight: '500' },
});
