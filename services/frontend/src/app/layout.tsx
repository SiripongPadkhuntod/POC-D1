import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "POC-D1",
  description: "Direct Ant Media multi-source broadcast proof of concept",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="th"><body>{children}</body></html>;
}
