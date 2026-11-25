import type { Metadata } from "next";
import { Fredoka, Geist } from "next/font/google";
import "./globals.css";

const geist = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const fredoka = Fredoka({ variable: "--font-fredoka", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "StoryMotion — Animated documentaries from a prompt",
  description: "Tell a story. Claude researches and directs it, Remotion animates it — export for YouTube, Shorts, Reels and Instagram.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geist.variable} ${fredoka.variable} h-full antialiased`}>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
