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
      <body className={`${geistSans.variable} ${geistMono.variable} industrial-bg antialiased`}>
        <LanguageProvider>
          <BootErrorLogger />
          <SubscriptionSyncProvider>{children}</SubscriptionSyncProvider>
        </LanguageProvider>
      </body>
    </html>
  );
}
