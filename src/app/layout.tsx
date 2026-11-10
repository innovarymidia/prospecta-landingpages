import type { Metadata } from "next";
import { Rubik } from "next/font/google";
import "./globals.css";

const rubik = Rubik({
  subsets: ["latin"],
  weight: ["300", "400", "500", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Prospecta | Painel de Prospecção WhatsApp",
  description: "CRM de prospecção B2B e atendimento pelo WhatsApp",
  icons: {
    icon: "/freedash/favicon.png",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body className={rubik.className}>{children}</body>
    </html>
  );
}
