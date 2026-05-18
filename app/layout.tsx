import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Situational Awareness 13F Dashboard",
  description: "Charts for Situational Awareness LP 13F filings.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
