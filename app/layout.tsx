import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const isEnBuild = process.env.NEXT_PUBLIC_LANG === "en";
const siteTitle = isEnBuild ? "Ask Karpuz" : "Karpuz'a Sor";
const siteDesc = isEnBuild
  ? "Istanbul Bilgi University Santral Campus Navigation"
  : "İstanbul Bilgi Üniversitesi Santral Kampüs Navigasyon";
const siteUrl = isEnBuild
  ? "https://santral-map-en.vercel.app"
  : "https://santral-map.vercel.app";
const ogImage = isEnBuild ? "/og-image-en.jpg" : "/og-image.jpg";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: siteTitle,
  description: siteDesc,
  manifest: "/manifest.json",
  openGraph: {
    title: siteTitle,
    description: siteDesc,
    images: [{ url: ogImage, width: 630, height: 630 }],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: siteTitle,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  interactiveWidget: "resizes-content",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="tr"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <link rel="apple-touch-icon" href="/icon-192.png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="theme-color" content="#c41230" />
      </head>
      <body>
        {children}
        <script dangerouslySetInnerHTML={{__html: `
          if ('serviceWorker' in navigator) {
            window.addEventListener('load', () => {
              navigator.serviceWorker.register('/sw.js').catch(() => {});
              let reloading=false;
              navigator.serviceWorker.addEventListener('controllerchange', () => {
                if(reloading)return;
                reloading=true;
                window.location.reload();
              });
            });
          }
        `}} />
      </body>
    </html>
  );
}
