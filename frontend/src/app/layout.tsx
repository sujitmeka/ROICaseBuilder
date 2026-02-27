import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
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
  title: "CPROI - ROI Case Builder",
  description: "Generate data-backed ROI cases for experience design engagements",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <nav className="border-b border-gray-200 bg-white">
          <div className="max-w-6xl mx-auto px-6 flex items-center h-14 gap-8">
            <Link href="/" className="text-sm font-semibold tracking-tight text-gray-900">
              CPROI
            </Link>
            <div className="flex items-center gap-6">
              <Link href="/" className="text-sm text-gray-600 hover:text-gray-900">
                ROI Builder
              </Link>
              <Link href="/methodologies" className="text-sm text-gray-600 hover:text-gray-900">
                Methodologies
              </Link>
            </div>
          </div>
        </nav>
        {children}
      </body>
    </html>
  );
}
