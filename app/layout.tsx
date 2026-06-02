import type { Metadata } from 'next'
import { Poppins } from 'next/font/google'
import './globals.css'

const poppins = Poppins({
  weight: ['300', '400', '500', '600', '700'],
  subsets: ['latin'],
  variable: '--font-poppins',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Better Connected',
  // Staff-only mirror — keep it out of search engines entirely.
  robots: { index: false, follow: false },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en-GB" className={poppins.variable}>
      <head>
        {/* Retained Oxygen stylesheets for faithful design.
            universal.css = global; 158.css = header/global template. */}
        <link rel="stylesheet" href="/oxygen-css/universal.css" />
        <link rel="stylesheet" href="/oxygen-css/158.css" />
      </head>
      <body className="font-sans">{children}</body>
    </html>
  )
}
