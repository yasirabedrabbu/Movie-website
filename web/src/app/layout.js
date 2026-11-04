import { Geist } from "next/font/google";
import "./globals.css";
import { config } from "@/lib/config";
import { SITE_NAME, ACCENT } from "@/lib/constants";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap",
});

export const metadata = {
  metadataBase: new URL(config.site.url),
  title: {
    default: SITE_NAME,
    template: `%s | ${SITE_NAME}`,
  },
  description: "Browse and watch movies",
  applicationName: SITE_NAME,
  openGraph: {
    siteName: SITE_NAME,
    type: "website",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
  },
};

export const viewport = {
  themeColor: ACCENT,
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={geistSans.variable}>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}