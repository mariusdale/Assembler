export const metadata = {
  title: 'Sample App',
  description: 'A minimal Next.js app for testing DevAssemble',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
