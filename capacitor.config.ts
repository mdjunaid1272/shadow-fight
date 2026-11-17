import type { CapacitorConfig } from '@capacitor/cli';

/** Android (and iOS-ready) wrapper. Run `npm run android:sync` after `npm run build`. */
const config: CapacitorConfig = {
  appId: 'com.shadowclash.game',
  appName: 'Shadow Clash',
  webDir: 'dist',
  backgroundColor: '#0b0d14',
  android: { allowMixedContent: false },
  server: { androidScheme: 'https' }, // secure context: IndexedDB, fullscreen and audio behave like the web build
};
export default config;
