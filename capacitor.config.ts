/**
 * Capacitor configuration for iOS/Android wrapping.
 *
 * Plain JS (no external type import) so the Next.js build works
 * without Capacitor as a dependency. When you run Capacitor init,
 * install the CLI and restore the typed import.
 */
const config = {
  appId: "app.elevio.mobile",
  appName: "Elevio",
  webDir: "out",
  server: {
    // In development: point to the Next.js dev server.
    // In production: remove this to serve from the bundled webDir,
    // or set url to the deployed app URL.
    // url: "http://localhost:3000",
    // hostname: "localhost",
    androidScheme: "https",
  },
  ios: {
    contentInset: "automatic",
    prefersHomeIndicatorAutoHidden: true,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 0,
      backgroundColor: "#05070a",
      showSpinner: false,
    },
    StatusBar: {
      style: "DARK",
      backgroundColor: "#05070a",
    },
  },
};

module.exports = config;
