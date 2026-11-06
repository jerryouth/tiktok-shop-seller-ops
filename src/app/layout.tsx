import type { Metadata } from 'next';
import './globals.css';
import { AppShell } from '@/components/app-shell';

export const metadata: Metadata = {
  title: {
    default: '选品参谋 · TikTok Shop 跨境电商选品平台',
    template: '%s | 选品参谋',
  },
  description:
    '面向 TikTok 跨境电商卖家的智能选品运营后台：选品库筛选、多维度智能评分、市场趋势看板，辅助卖家高效决策。',
  keywords: ['TikTok Shop', '跨境电商', '选品', '运营后台', '市场趋势'],
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="antialiased">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
