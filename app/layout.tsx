import type { Metadata } from "next";
import { Outfit, DM_Sans, Bangers, DM_Mono } from "next/font/google";
import { WalletProvider } from "@/components/wallet-provider";
import "./globals.css";

const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
  weight: ["700", "800", "900"],
});

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
});

const bangers = Bangers({
  variable: "--font-bangers",
  subsets: ["latin"],
  weight: "400",
});

const dmMono = DM_Mono({
  variable: "--font-dm-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "ShelbySafe — Encrypted Vault",
  description:
    "Store encrypted notes on Shelby Protocol. Only your wallet can decrypt.",
  openGraph: {
    title: "ShelbySafe — Encrypted Vault on Shelby Protocol",
    description:
      "End-to-end encrypted vault. No server ever sees your data.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${outfit.variable} ${dmSans.variable} ${bangers.variable} ${dmMono.variable} antialiased`}
    >
      <body>
        <WalletProvider>{children}</WalletProvider>
      </body>
    </html>
  );
}
