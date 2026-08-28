import type { Metadata } from "next";
import { Geist, Fraunces, JetBrains_Mono } from "next/font/google";
import { ThemeProvider } from "@/context/ThemeContext";
import "./globals.css";

const geist = Geist({
  subsets: ["latin"],
  variable: "--font-geist",
  display: "swap",
});

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  display: "swap",
  axes: ["opsz", "SOFT"],
});

const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains",
  display: "swap",
});

export const metadata: Metadata = {
  title: "AWS QC Process",
  description: "Spatiotemporal Anomaly Detection — Analyst Dashboard",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geist.variable} ${fraunces.variable} ${jetbrains.variable}`}
    >
      <head>
        {/* No-flash bootstrap — apply saved theme before paint so the choice
            is consistent across every tab/page with no flicker. Text size is
            intentionally NOT persisted: the dashboard always loads at M
            (the globals.css root values), matching Header.tsx defaults. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function () {
                var root = document.documentElement;
                try {
                  var stored = localStorage.getItem('aws-qc-theme');
                  var theme = stored === 'dark' || stored === 'light' ? stored : 'light';
                  root.setAttribute('data-theme', theme);
                } catch (e) {
                  root.setAttribute('data-theme', 'light');
                }
              })();
            `,
          }}
        />
      </head>
      <body className="antialiased">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
