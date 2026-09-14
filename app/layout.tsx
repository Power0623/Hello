import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Luma · 人生操作系统',
  description: '一个帮你整理任务、习惯与目标的清爽个人仪表盘。',
  metadataBase: new URL(process.env.SITE_URL ?? 'https://luma-life-os.perky-isle-4363.chatgpt.site'),
  openGraph: {
    title: 'Luma · 人生操作系统',
    description: '把重要的事，放进自己的节奏里。',
    images: ['/og.png'],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Luma · 人生操作系统',
    description: '把重要的事，放进自己的节奏里。',
    images: ['/og.png'],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
