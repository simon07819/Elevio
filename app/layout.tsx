import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { LanguageProvider } from "@/components/i18n/LanguageProvider";
import { SubscriptionSyncProvider } from "@/components/SubscriptionSyncProvider";
import { BootErrorLogger } from "@/components/BootErrorLogger";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Elevio",
  description: "Dispatch temps reel pour elevateurs de chantier.",
  manifest: "/manifest.webmanifest",
  icons: {
    apple: "/icon-192.png",
  },
  appleWebApp: {
    capable: true,
    title: "Elevio",
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  themeColor: "#05070a",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr">
      <head>
        <script dangerouslySetInnerHTML={{ __html: `
          window.onerror = function(m,s,l,c,e) {
            console.error("[EARLY BOOT ERROR] onerror:", m, s + ":" + l + ":" + c, e && e.stack);
          };
          window.onunhandledrejection = function(ev) {
            var r = ev.reason;
            console.error("[EARLY BOOT ERROR] unhandled rejection:", r && r.message, r && r.stack);
          };
        ` }} />
      </head>
      <body className={`${geistSans.variable} ${geistMono.variable} industrial-bg antialiased`}>
        <LanguageProvider>
          <BootErrorLogger />
          <SubscriptionSyncProvider>{children}</SubscriptionSyncProvider>
        </LanguageProvider>
      </body>
    </html>
  );
}
