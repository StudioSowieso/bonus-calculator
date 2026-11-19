import type { Metadata } from "next";
import { Bricolage_Grotesque, Instrument_Sans } from "next/font/google";
import "./globals.css";

const display = Bricolage_Grotesque({
  subsets: ["latin"],
  variable: "--nf-display",
  display: "swap",
});
const body = Instrument_Sans({
  subsets: ["latin"],
  variable: "--nf-body",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Bonus-checker: haal ik mijn drempel met verlof?",
  description:
    "Plan je verlof in een kalender en zie of je de maandelijkse omzetdrempel voor je 5%-prestatiebonus haalt.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="nl" className={`${display.variable} ${body.variable}`}>
      <body>{children}</body>
    </html>
  );
}
