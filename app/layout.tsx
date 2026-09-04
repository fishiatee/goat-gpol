import type { Metadata } from "next"
import { Geist_Mono } from "next/font/google"
import localFont from "next/font/local"

import "./globals.css"
import { ThemeProvider } from "@/components/theme-provider"
import { TooltipProvider } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils";

const fontSans = localFont({
  src: [
    { path: "./fonts/torus-thin.woff2", weight: "200", style: "normal" },
    { path: "./fonts/torus-light.woff2", weight: "300", style: "normal" },
    { path: "./fonts/torus-regular.woff2", weight: "400", style: "normal" },
    { path: "./fonts/torus-semibold.woff2", weight: "600", style: "normal" },
    { path: "./fonts/torus-bold.woff2", weight: "700", style: "normal" },
    { path: "./fonts/torus-heavy.woff2", weight: "800", style: "normal" },
  ],
  variable: "--font-sans",
  fallback: ["system-ui", "sans-serif"],
})

const fontMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
})

export const metadata: Metadata = {
  title: "goat-gpol",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={cn("antialiased", fontMono.variable, "font-sans", fontSans.variable)}
    >
      <body>
        <ThemeProvider>
          <TooltipProvider>{children}</TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
