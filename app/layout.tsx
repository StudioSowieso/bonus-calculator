import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Bonus-checker: haal ik mijn drempel met verlof?",
  description:
    "Plan je verlof in een kalender en zie of je de maandelijkse omzetdrempel voor je 5%-prestatiebonus haalt.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="nl">
      <body>{children}</body>
    </html>
  );
}
