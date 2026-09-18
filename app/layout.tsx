import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Atkinson_Hyperlegible_Mono, Atkinson_Hyperlegible_Next } from "next/font/google";
import "./globals.css";
import Providers from "./lib/Providers";
import RouteLabScene from "./lib/LabScene";

// Atkinson Hyperlegible was drawn for low-vision readers: 0/O, 1/l/I and
// rn/m stay distinct, which matters on Lab IDs, results and phone screens.
// Next has no metric overrides for these families yet, so name the fallback
// stacks directly instead of letting it guess one.
const lfSans = Atkinson_Hyperlegible_Next({
  variable: "--font-lf-sans",
  subsets: ["latin"],
  adjustFontFallback: false,
  fallback: ["ui-sans-serif", "system-ui", "sans-serif"],
});

const lfMono = Atkinson_Hyperlegible_Mono({
  variable: "--font-lf-mono",
  subsets: ["latin"],
  adjustFontFallback: false,
  fallback: ["ui-monospace", "monospace"],
});

export const metadata: Metadata = {
  title: "LabFlow",
  description: "Clinic laboratory operations for LabFlow.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Before any CSS arrives: light only, and no browser-applied dark mode.
  colorScheme: "only light",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      className={`${lfSans.variable} ${lfMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-sans">
        <RouteLabScene />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
