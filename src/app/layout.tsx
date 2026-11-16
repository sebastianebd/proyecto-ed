import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({ subsets: ["latin"], variable: "--font-jakarta", display: "swap" });

export const metadata: Metadata = {
  title: "Escuela Dominical 5ta ACyM",
  description: "Escuela Dominical 5ta ACyM",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { themeColor: "#EA580C" };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Leer x-nonce (puesto por proxy.ts) fuerza render dinámico por petición para que
  // Next aplique el nonce de la CSP a sus scripts. Nunca se usa dangerouslySetInnerHTML.
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  return (
    <html lang="es-CL" className={jakarta.variable} data-nonce-applied={nonce ? "true" : "false"}>
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
