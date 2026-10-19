import type { Metadata, Viewport } from "next";
import { Kalam, Literata, Pixelify_Sans } from "next/font/google";
import "./globals.css";
import "./gathering.css";

// The design system's three typefaces: Pixelify Sans (display and labels),
// Literata (body and buttons) and Kalam (handwriting).
const pixelify = Pixelify_Sans({ subsets: ["latin"], weight: ["500", "600", "700"], variable: "--font-pixelify" });
const literata = Literata({ subsets: ["latin"], style: ["normal", "italic"], variable: "--font-literata" });
const kalam = Kalam({ subsets: ["latin"], weight: ["400"], variable: "--font-kalam" });

export const metadata: Metadata = {
  title: "The Gathering",
  description: "Murder at Marlowe Manor: a party murder mystery for 3 to 6 players, played on a shared TV and your phones.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#111113",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${pixelify.variable} ${literata.variable} ${kalam.variable}`}>
      <body>{children}</body>
    </html>
  );
}
