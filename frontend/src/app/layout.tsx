import type { Metadata, Viewport } from 'next';
import { Geist, Noto_Sans_Devanagari } from 'next/font/google';
import './globals.css';
import { Footer } from '@/components/footer';
import { Header } from '@/components/header';
import { ToastProvider } from '@/components/toast';
import { LocaleProvider } from '@/i18n';
import { getLocale } from '@/i18n/server';
import { messages } from '@/i18n/messages';
import { AuthProvider } from '@/lib/auth';
import { SITE_URL } from '@/lib/config';

const geist = Geist({ variable: '--font-geist-sans', subsets: ['latin'] });
const deva = Noto_Sans_Devanagari({ variable: '--font-deva', subsets: ['devanagari'], display: 'swap' });

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: 'Clinic Platform — book a doctor token in Rewa', template: '%s | Clinic Platform' },
  description: 'Find doctors and clinics in Rewa, book a token online and follow the queue live from your phone.',
  openGraph: { type: 'website', siteName: 'Clinic Platform', locale: 'hi_IN' },
};

export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#0f8676' };

export default async function RootLayout({ children }: LayoutProps<'/'>) {
  const locale = await getLocale();
  return (
    <html lang={locale} className={`${geist.variable} ${deva.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <LocaleProvider locale={locale} messages={messages[locale]}>
          <AuthProvider>
            <ToastProvider>
              <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-card focus:p-2">
                {messages[locale]['common.skipToContent']}
              </a>
              <Header />
              <main id="main" className="flex-1">{children}</main>
              <Footer />
            </ToastProvider>
          </AuthProvider>
        </LocaleProvider>
      </body>
    </html>
  );
}
