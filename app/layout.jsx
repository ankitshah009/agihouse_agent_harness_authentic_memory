import "./globals.css";

export const metadata = {
  title: "Aubric AML — Authenticity Memory Layer",
  description:
    "A Next.js demo for Aubric's authenticity-memory engine: short-term, semantic, episodic, and procedural layers.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

