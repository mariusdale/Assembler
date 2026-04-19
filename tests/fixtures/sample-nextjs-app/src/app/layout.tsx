export const metadata = {
  title: 'Sample App',
  description: 'A sample Next.js app for Assembler testing',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
