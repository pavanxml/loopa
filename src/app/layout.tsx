import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ToastProvider } from "@/components/Toast";

export const metadata: Metadata = {
  title: "LOOPA — People, Content, Communities, Activities",
  description: "Discover interesting content and people, join communities, and go to activities. Loop in.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#6659ff",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="font-sans antialiased">
        <script
          // Prevents a light/dark flash on load by applying the theme class
          // before React hydrates, reading the user's saved preference.
          dangerouslySetInnerHTML={{
            __html: `try{const t=localStorage.getItem('loopa-theme');if(t==='dark'||(!t&&window.matchMedia('(prefers-color-scheme: dark)').matches))document.documentElement.classList.add('dark')}catch(e){}`,
          }}
        />
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
