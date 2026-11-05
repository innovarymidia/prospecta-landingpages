import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = { title: "Prospecta · Central de prospecção", description: "CRM de prospecção e atendimento automatizado" };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="pt-BR"><body>{children}</body></html>; }
