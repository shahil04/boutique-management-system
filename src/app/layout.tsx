import type { Metadata } from "next";
import {
  Plus_Jakarta_Sans,
  Noto_Sans_Devanagari,
  Geist_Mono,
} from "next/font/google";
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const devanagari = Noto_Sans_Devanagari({
  variable: "--font-devanagari",
  subsets: ["devanagari"],
  weight: ["400", "500", "600", "700"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "BoutiqueFlow — Tailoring Slip OCR & Order Manager",
  description:
    "All-in-one boutique tailoring management with Hindi/English AI Vision slip OCR, side-by-side manual verification, measurements, billing, and WhatsApp updates.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${jakarta.variable} ${devanagari.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-[#faf7f2] text-[#1f1a1c]">
        {children}
      </body>
    </html>
  );
}
