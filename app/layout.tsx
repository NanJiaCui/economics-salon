import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "中国经济沙龙 · China Economics Salon",
  description: "聚焦中国经济最新议题，完整AI圆桌讨论、个人观点记忆与会后媒体文章。",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="antialiased">{children}</body>
    </html>
  );
}
