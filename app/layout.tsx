import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://jogyo-3cab9.web.app/"),
  title: "Jogyo Clock",
  description: "조교를 위한 스마트 시험 시계",
  openGraph: {
    title: "Jogyo Clock",
    description: "정확한 시간, 공정한 시험",
    url: "https://jogyo-3cab9.web.app/",
    siteName: "Jogyo Clock",
    locale: "ko_KR",
    type: "website",
    images: [
      {
        url: "/og.png",
        width: 1200,
        height: 630,
        alt: "Jogyo Clock - 조교를 위한 스마트 시험 시계",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Jogyo Clock",
    description: "정확한 시간, 공정한 시험",
    images: ["/og.png"],
  },
};
export const viewport: Viewport = {
  themeColor: "#030712",
  colorScheme: "dark",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
