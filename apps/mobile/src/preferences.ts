export const FONT_SIZES = { small: 0.9, standard: 1, large: 1.15, extraLarge: 1.3 };
export type Preferences = {
  theme: 'system' | 'light' | 'dark';
  fontSize: keyof typeof FONT_SIZES;
  projectRatio: number;
};
export const DEFAULT_PREFERENCES: Preferences = {
  theme: 'system',
  fontSize: 'standard',
  projectRatio: 0.35,
};
export const PREFERENCES_KEY = 'general-preferences';
export const DIVIDER_WIDTH = 24;
export const MIN_PROJECT_RATIO = 0.25;
export const MAX_PROJECT_RATIO = 0.6;
export function clampProjectRatio(ratio: number) {
  return Math.max(MIN_PROJECT_RATIO, Math.min(MAX_PROJECT_RATIO, Number.isFinite(ratio) ? ratio : DEFAULT_PREFERENCES.projectRatio));
}
export function normalizePreferences(value: unknown): Preferences {
  const saved = value && typeof value === 'object' ? value as Partial<Preferences> : {};
  return {
    theme: saved.theme === 'light' || saved.theme === 'dark' ? saved.theme : 'system',
    fontSize: typeof saved.fontSize === 'string' && Object.hasOwn(FONT_SIZES, saved.fontSize)
      ? saved.fontSize : DEFAULT_PREFERENCES.fontSize,
    projectRatio: typeof saved.projectRatio === 'number' && Number.isFinite(saved.projectRatio)
      ? clampProjectRatio(saved.projectRatio) : DEFAULT_PREFERENCES.projectRatio,
  };
}
// Keep both panes usable when the window is narrower than the preferred ratio allows.
export function projectPaneWidth(availableWidth: number, ratio: number) {
  if (!Number.isFinite(availableWidth) || availableWidth <= 0) return 0;
  const minimum = Math.min(220, availableWidth / 2);
  const maximum = Math.max(minimum, availableWidth - 320);
  return Math.max(minimum, Math.min(maximum, availableWidth * clampProjectRatio(ratio)));
}
