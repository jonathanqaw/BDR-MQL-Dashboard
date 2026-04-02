import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'MQL Dashboard · QA Wolf',
  description: 'Live MQL lead tracking from Slack',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
