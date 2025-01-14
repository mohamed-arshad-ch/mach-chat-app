import './globals.css'
import { Poppins } from 'next/font/google'
import { TooltipProvider } from "@/components/ui/tooltip"

const poppins = Poppins({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'], // Specify desired font weights
});


export const metadata = {
  title: 'MachChat',
  description: 'A messaging platform',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <TooltipProvider>
        <body className={poppins.className}>{children}</body>
      </TooltipProvider>
    </html>
  )
}

