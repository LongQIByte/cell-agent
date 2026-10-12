import type { ConfigContext, ExpoConfig } from 'expo/config';

export default ({ config }: ConfigContext): ExpoConfig => {
  if (process.env.APP_VARIANT !== 'development') return config as ExpoConfig;
  return {
    ...config,
    name: 'Codex Remote Dev',
    slug: 'codex-remote',
    scheme: 'codex-remote-dev',
    android: { ...config.android, package: 'com.codexremote.personal.dev' },
    ios: { ...config.ios, bundleIdentifier: 'com.codexremote.personal.dev' },
    plugins: [
      ...(config.plugins ?? []),
      ['expo-dev-client', { launchMode: 'most-recent', addGeneratedScheme: false }],
    ],
  };
};
