import type { Metadata } from 'next';
import { Providers } from './providers';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: process.env.NEXT_PUBLIC_APP_NAME || 'Pounds Microfinance Ltd',
    template: `%s | ${process.env.NEXT_PUBLIC_APP_NAME || 'Pounds MFI'}`,
  },
  description: 'Professional Microfinance Management System',
  viewport: 'width=device-width, initial-scale=1, maximum-scale=1',
  themeColor: '#1e40af',
  manifest: '/manifest.json',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
