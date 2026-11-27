import type { Metadata, Viewport } from "next";
import { Herr_Von_Muellerhoff, Kalam, Literata, Mrs_Saint_Delafield, Pinyon_Script, Pixelify_Sans } from "next/font/google";
import localFont from "next/font/local";
import "./globals.css";
import "./gathering.css";
import "./trapped.css";
import "./guestbook.css";

// The design system's typefaces: Jersey 15 (display and labels; it replaced Pixelify Sans,
// which was hard to read on phones), Literata (body and buttons) and Kalam (handwriting).
// Jersey 15 (SIL Open Font License, Google Fonts) is loaded twice from the same file: scaled up 18%
// for The Gathering and Marlowe Manor, whose sizes were set for Pixelify Sans's taller letters, and
// at its own size for Trapped Below, which was sized for it.
const pixel = localFont({ src: "./fonts/jersey-15-latin.woff2", weight: "400", display: "swap", variable: "--font-pixel", declarations: [{ prop: "size-adjust", value: "118%" }] });
const pixelPlain = localFont({ src: "./fonts/jersey-15-latin.woff2", weight: "400", display: "swap", variable: "--font-pixel-plain" });
// Pixelify Sans is kept only for the "THE GATHERING" title on the first screen (--pixel-title).
const pixelify = Pixelify_Sans({ subsets: ["latin"], weight: ["700"], variable: "--font-pixelify" });
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
  // The site is dark already. Saying so stops phones' automatic dark mode (Chrome on Android,
  // Samsung Internet) from recolouring it, which hid the white and black wires.
  colorScheme: "dark",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${pixel.variable} ${pixelPlain.variable} ${pixelify.variable} ${literata.variable} ${kalam.variable} ${sigA.variable} ${sigB.variable} ${sigC.variable}`}>
      <body>{children}</body>
    </html>
  );
}
