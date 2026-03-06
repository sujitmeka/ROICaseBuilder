import type { Metadata } from "next";
import { Outfit } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
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
      <body className={`${outfit.variable} antialiased`}>
        <nav className="bg-black">
          <div className="max-w-[1280px] mx-auto px-12 flex items-center justify-between h-16">
            <Link
              href="/"
              className="text-lg font-semibold tracking-tight text-white"
            >
              CPROI
            </Link>
            <div className="flex items-center gap-10">
              <Link
                href="/"
                className="text-[13px] font-medium uppercase tracking-[0.15em] text-[#a8a8a8] hover:text-white transition-colors"
              >
                ROI Builder
              </Link>
              <Link
                href="/methodologies"
                className="text-[13px] font-medium uppercase tracking-[0.15em] text-[#a8a8a8] hover:text-white transition-colors"
              >
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
