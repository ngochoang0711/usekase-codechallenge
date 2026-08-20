import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Fringe',
  description: 'Fringe festival ticketing',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
