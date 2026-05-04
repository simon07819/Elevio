import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.elevio.app',
  appName: 'Elevio',
  webDir: 'out',
  server: {
    // In development: point to the Next.js dev server (with /welcome entry)
    // In production: point to the deployed Vercel URL so the iOS app loads
    // the live site instead of a static placeholder.
    // The web app detects Capacitor on / and redirects to /welcome.
    url: process.env.CAPACITOR_SERVER_URL || process.env.NEXT_PUBLIC_SITE_URL || undefined,
    androidScheme: 'https',
  },
};

export default config;
