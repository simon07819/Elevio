import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.elevio.app',
  appName: 'Elevio',
  webDir: 'out',
  server: {
    url: 'https://elevio-seven.vercel.app',
    androidScheme: 'https',
  },
};

export default config;