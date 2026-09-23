import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = { title: "Novatune — a soundtrack for us", description: "Your own little corner of music. Listen, make a playlist, and share an evening with someone.", icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" } };
export default function RootLayout({children}: Readonly<{children: React.ReactNode}>) { return <html lang="en"><body>{children}</body></html>; }
