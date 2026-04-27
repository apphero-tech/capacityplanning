import type { Metadata } from "next"
import { Fraunces, Inter_Tight, JetBrains_Mono } from "next/font/google"
import { TooltipProvider } from "@/components/ui/tooltip"
import "./globals.css"

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-display",
  axes: ["opsz", "SOFT"],
  display: "swap",
})

const interTight = Inter_Tight({
  subsets: ["latin"],
  variable: "--font-sans",
  weight: ["300", "400", "500", "600", "700"],
})

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  weight: ["300", "400", "500", "600"],
})

export const metadata: Metadata = {
  title: "York · Capacity",
  description: "An editorial planning surface.",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${fraunces.variable} ${interTight.variable} ${jetbrainsMono.variable} font-sans antialiased`}
      >
        <TooltipProvider>{children}</TooltipProvider>
      </body>
    </html>
  )
}
