import type { Metadata } from 'next';
import { Vazirmatn } from 'next/font/google';
import { PLATFORM_DESCRIPTION, PLATFORM_NAME, PLATFORM_TAGLINE } from '@deska/shared';
import { ConfirmProvider } from '@/components/ui/confirm-provider';
import { ToastProvider } from '@/components/ui/toast-provider';
import { AuthProvider } from '@/lib/auth-context';
import { TenantProvider } from '@/lib/tenant-context';
import './globals.css';

const vazirmatn = Vazirmatn({
  subsets: ['arabic'],
  variable: '--font-vazirmatn',
  display: 'swap',
});

export const metadata: Metadata = {
  title: {
    default: PLATFORM_NAME,
    template: `%s | ${PLATFORM_NAME}`,
  },
  description: PLATFORM_DESCRIPTION,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fa" dir="rtl" className={vazirmatn.variable}>
      <body className="font-sans">
        <AuthProvider>
          <TenantProvider>
            <ConfirmProvider>
              <ToastProvider>{children}</ToastProvider>
            </ConfirmProvider>
          </TenantProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
