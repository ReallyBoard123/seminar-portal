import type { Metadata } from "next";
import { Geist } from "next/font/google";

import { cn } from "@/lib/utils";

import "./globals.css";

const geist = Geist({ subsets: ["latin"], variable: "--font-sans" });

/**
 * An internal seminar tool has no business in a search index. Everything
 * behind the gate is unreachable to a crawler anyway; noindex covers the one
 * page that is public — the sign-in — so searching for the seminar does not
 * surface a login form to the world.
 */
export const metadata: Metadata = {
  title: "Seminar Portal",
  description: "Submissions, reviews and deadlines for an internal conference.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={cn("font-sans", geist.variable)}>
      <body>{children}</body>
    </html>
  );
}
