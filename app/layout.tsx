import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Economics Salon · 经济思想沙龙",
  description: "让不同的经济理论，在同一张圆桌上接受现实的检验。",
  other: {
    "codex-preview": "development",
  },
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
