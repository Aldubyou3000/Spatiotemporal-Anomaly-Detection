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
  title: "AWS QC Pipeline",
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
        {/* No-flash bootstrap — apply saved theme AND text size before paint so
            the choice is consistent across every tab/page with no flicker.
            The size table here MUST stay in sync with TEXT_SIZES in Header.tsx. */}
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
                try {
                  var SIZES = [
                    { base:'13px', sm:'12px',   xs:'11px',   md:'12px', lg:'14px', xl:'17px', metric:'14px' },
                    { base:'15px', sm:'14px',   xs:'12.5px', md:'14px', lg:'16px', xl:'20px', metric:'16px' },
                    { base:'16px', sm:'15px',   xs:'13px',   md:'15px', lg:'17px', xl:'22px', metric:'18px' },
                    { base:'18px', sm:'17px',   xs:'14px',   md:'17px', lg:'19px', xl:'25px', metric:'20px' }
                  ];
                  var idx = parseInt(localStorage.getItem('ui-text-size'), 10);
                  if (idx >= 0 && idx < SIZES.length) {
                    var s = SIZES[idx];
                    root.style.setProperty('--font-base',   s.base);
                    root.style.setProperty('--font-sm',     s.sm);
                    root.style.setProperty('--font-xs',     s.xs);
                    root.style.setProperty('--font-md',     s.md);
                    root.style.setProperty('--font-lg',     s.lg);
                    root.style.setProperty('--font-xl',     s.xl);
                    root.style.setProperty('--font-metric', s.metric);
                  }
                } catch (e) {}
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
