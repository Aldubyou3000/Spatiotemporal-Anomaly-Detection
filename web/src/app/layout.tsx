import type { Metadata } from "next";
import { Roboto, JetBrains_Mono } from "next/font/google";
import { ThemeProvider } from "@/context/ThemeContext";
import "./globals.css";

const roboto = Roboto({
  subsets: ["latin"],
  variable: "--font-roboto",
  display: "swap",
  weight: ["400", "500", "600", "700"],
});

const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains",
  display: "swap",
});

export const metadata: Metadata = {
  title: "AWS Sentinel — Anomaly Detector",
  description: "AWS Sentinel — Spatiotemporal Anomaly Detection",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${roboto.variable} ${jetbrains.variable}`}
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
                  var stored = localStorage.getItem('aws-sentinel-theme') || localStorage.getItem('aws-qc-theme');
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
