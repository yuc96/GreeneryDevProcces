import type { Metadata } from "next";
import { Inter } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import "@/styles/proposal-client.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Greenery Productions — Operations Hub",
  description:
    "Proposals, maintenance programs, and modular Greenery workspace (expandable by department).",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.className} antialiased`}>
        <Script
          id="greenery-theme-init"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var key="greenery-dashboard-theme";var saved=localStorage.getItem(key);var dark=saved==="dark"||(!saved&&window.matchMedia&&window.matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.classList.toggle("dark",!!dark);}catch(e){}})();`,
          }}
        />
        {children}
      </body>
    </html>
  );
}

