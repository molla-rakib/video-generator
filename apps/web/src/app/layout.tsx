import type { Metadata } from "next";
import { Inter, Noto_Sans_Bengali } from "next/font/google";
import { Sidebar } from "@/components/layout/sidebar";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const bengali = Noto_Sans_Bengali({ subsets: ["bengali"], variable: "--font-bengali", weight: ["400", "500", "600", "700"] });

export const metadata: Metadata = {
  title: { default: "Documentary Studio", template: "%s · Documentary Studio" },
  description: "Create Bangla documentaries — from an idea to a finished film.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="bn" className={`${inter.variable} ${bengali.variable}`}>
      <body className="flex h-dvh overflow-hidden bg-background font-sans">
        <TooltipProvider delayDuration={300}>
          <Sidebar />
          <main className="min-w-0 flex-1 overflow-auto">{children}</main>
          <Toaster position="bottom-right" />
        </TooltipProvider>
      </body>
    </html>
  );
}
