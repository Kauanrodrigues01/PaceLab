import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/providers/ThemeProvider";
import { Navbar } from "@/components/layout/Navbar";
import { BottomNav } from "@/components/layout/BottomNav";
import { Footer } from "@/components/layout/Footer";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "PaceLab — Calculadoras de Corrida",
  description:
    "Calculadoras de pace, velocidade, TAF, metas e treinos intervalados para corredores.",
  keywords: ["corrida", "pace", "velocidade", "TAF", "calculadora", "corredor"],
  authors: [{ name: "PaceLab" }],
  openGraph: {
    title: "PaceLab — Calculadoras de Corrida",
    description: "Calculadoras gratuitas para corredores: pace, TAF, metas e muito mais.",
    type: "website",
  },
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/icon.png", type: "image/png" },
      { url: "/images/ico.png", type: "image/png" },
    ],
    shortcut: "/favicon.ico",
    apple: [
      { url: "/apple-icon.png", type: "image/png" },
      { url: "/images/ico.png", type: "image/png" },
    ],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body
        className={`${inter.variable} font-sans antialiased min-h-screen bg-slate-50 dark:bg-[#0B1020] text-slate-900 dark:text-[#FFFFFF] flex flex-col`}
      >
        <ThemeProvider>
          <Navbar />
          <div className="flex-1 pb-20 md:pb-8">{children}</div>
          <Footer />
          <BottomNav />
        </ThemeProvider>
      </body>
    </html>
  );
}
