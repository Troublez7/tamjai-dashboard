import type { Metadata } from 'next';
import './style.css';
import './dashboard.module.css';
export const metadata: Metadata = { title: 'TamJai Dashboard', description: 'Game farming reports dashboard' };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="th"><body>{children}</body></html>;
}
