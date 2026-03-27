import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '{{APP_NAME}}',
  description: '{{APP_DESCRIPTION}}',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>): JSX.Element {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
