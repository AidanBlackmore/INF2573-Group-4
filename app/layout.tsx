import type { Metadata, Viewport } from "next";
import { Jersey_15, Kalam, Literata } from "next/font/google";
import "./globals.css";
import "./gathering.css";
import "./trapped.css";

// The design system's three typefaces: Jersey 15 (display and labels; it replaced Pixelify Sans,
// which was hard to read on phones), Literata (body and buttons) and Kalam (handwriting).
const pixel = Jersey_15({ subsets: ["latin"], weight: "400", variable: "--font-pixel" });
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
    <html lang="en" className={`${pixel.variable} ${literata.variable} ${kalam.variable}`}>
      <body>{children}</body>
    </html>
  );
}
