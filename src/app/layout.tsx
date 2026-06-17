import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "StockIQ Personal",
  description: "Private single-operator equity-research decision terminal.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-paper text-ink antialiased">{children}</body>
    </html>
  );
}
