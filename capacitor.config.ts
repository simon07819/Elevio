import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.elevio.app',
  appName: 'Elevio',
  webDir: 'out',
  server: {
    // In development: point to the Next.js dev server
    // In production: point to your deployed URL or remove this key
    // to use the static webDir bundle instead
    url: process.env.CAPACITOR_SERVER_URL || undefined,
    androidScheme: 'https',
  },
};

export default config;
