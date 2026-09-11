import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Agenda CCTV | Congress Rental",
  description: "Calendario operativo para eventos, salones y operadores de CCTV.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
