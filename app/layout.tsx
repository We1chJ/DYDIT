import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "DYDIT — Did you do it today?",
  description:
    "A personal to-do list that tracks whether you actually follow through.",
};

/*
 * Runs before first paint so a dark-mode reload never flashes white.
 * Inlined deliberately: any deferred script is already too late.
 */
const themeScript = `
(function () {
  try {
    var stored = localStorage.getItem('dydit-theme');
    var dark = stored === 'dark' ||
      (stored !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches);
    if (dark) document.documentElement.classList.add('dark');
  } catch (e) {}
})();
`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${inter.variable} h-full`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      {/*
        Browser extensions commonly inject attributes onto <body> before React
        hydrates (cz-shortcut-listen, grammarly, …), which reads as a mismatch.
      */}
      <body className="flex min-h-full flex-col" suppressHydrationWarning>
        <TooltipProvider>{children}</TooltipProvider>
      </body>
    </html>
  );
}
