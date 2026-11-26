import type { Metadata, Viewport } from "next";
import { Herr_Von_Muellerhoff, Jersey_15, Kalam, Literata, Mrs_Saint_Delafield, Pinyon_Script, Pixelify_Sans } from "next/font/google";
import "./globals.css";
import "./gathering.css";
import "./trapped.css";
import "./guestbook.css";

// The design system's typefaces: Jersey 15 (pixel display and labels), Literata (body and buttons)
// and Kalam (handwriting). Pixelify Sans is kept only for the "THE GATHERING" title on the first screen.
const jersey = Jersey_15({ subsets: ["latin"], weight: ["400"], variable: "--font-jersey" });
const pixelify = Pixelify_Sans({ subsets: ["latin"], weight: ["500", "600", "700"], variable: "--font-pixelify" });
const literata = Literata({ subsets: ["latin"], style: ["normal", "italic"], variable: "--font-literata" });
const kalam = Kalam({ subsets: ["latin"], weight: ["400"], variable: "--font-kalam" });
// Signatures in Marlowe Manor's guest book (app/host/guestbook.tsx): one hand per guest, in turn.
const sigA = Mrs_Saint_Delafield({ subsets: ["latin"], weight: ["400"], variable: "--font-sig-a" });
const sigB = Herr_Von_Muellerhoff({ subsets: ["latin"], weight: ["400"], variable: "--font-sig-b" });
const sigC = Pinyon_Script({ subsets: ["latin"], weight: ["400"], variable: "--font-sig-c" });

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
    <html lang="en" className={`${jersey.variable} ${pixelify.variable} ${literata.variable} ${kalam.variable} ${sigA.variable} ${sigB.variable} ${sigC.variable}`}>
      <body>{children}</body>
    </html>
  );
}
