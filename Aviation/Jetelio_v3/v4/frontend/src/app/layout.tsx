import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono, Playfair_Display } from "next/font/google";
import "./globals.css";
import { QueryProvider } from "@/providers/query-provider";
import { AdminNav } from "@/components/AdminNav";
import { MobileNav } from "@/components/MobileNav";
import { ServiceWorkerRegistration } from "@/components/ServiceWorkerRegistration";
import { ThemeToggle } from "@/components/ThemeToggle";

const sans = Inter({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono", display: "swap" });
// Restrained luxury touch — hero headings and major section titles only,
// never body copy or dense tabular data (see task #88's design brief).
const display = Playfair_Display({ subsets: ["latin"], weight: ["600", "700"], variable: "--font-display", display: "swap" });

export const metadata: Metadata = {
  title: "Jetelio V3 — Trip & Permit Planning",
  description: "Flight-support trip and permit planning platform for business-jet and charter operations.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Jetelio",
  },
  icons: {
    icon: "/icons/icon.svg",
    apple: "/icons/icon-192.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#0A0C11",
  width: "device-width",
  initialScale: 1,
};

// Dark-first: with no stored preference this defaults straight to dark,
// never reading prefers-color-scheme. Runs before hydration so there's no
// flash of the wrong theme.
const THEME_INIT_SCRIPT = `(function(){try{var t=window.localStorage.getItem("jetelio_theme")||"dark";document.documentElement.dataset.theme=t;}catch(e){document.documentElement.dataset.theme="dark";}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable} ${display.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body>
        <QueryProvider>
          <AdminNav />
          <main className="mx-auto max-w-7xl px-4 py-6 pb-24 md:pb-6">{children}</main>
          <MobileNav />
          <ThemeToggle />
          <ServiceWorkerRegistration />
        </QueryProvider>
      </body>
    </html>
  );
}
