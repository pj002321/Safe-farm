import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Safe Farm AI",
  description: "농작물 상태와 날씨를 읽어 재배 적합도를 추천하는 서비스",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
