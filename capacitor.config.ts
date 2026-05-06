import type { CapacitorConfig } from '@capacitor/cli';

const serverUrl = process.env.CAPACITOR_SERVER_URL || '';

const config: CapacitorConfig = {
  appId: 'com.elevio.app',
  appName: 'Elevio',
  webDir: 'out',
  // androidScheme: 'https' — default in Capacitor 8, no need to set explicitly
  server: serverUrl ? { url: serverUrl, cleartext: true } : undefined,
  ios: {
    contentInset: 'automatic',
  },
};

export default config;