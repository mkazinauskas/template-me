import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { siteUrl } from "@/lib/site-url";
import { themeScript } from "@/lib/theme";
import { ThemeToggle } from "@/components/theme-toggle";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const title = "Template Me — Turn Word Docs into Fillable PDF Templates";
const description =
  "Upload a .docx file with {{placeholder}} tags and Template Me turns it into a web form. Fill it in — one document at a time or in bulk from a CSV — and download a finished PDF. Free and open source.";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: title,
    template: "%s · Template Me",
  },
  description,
  keywords: [
    "docx to pdf",
    "word to pdf",
    "word template",
    "fillable pdf",
    "document automation",
    "pdf generator",
    "bulk pdf generation",
    "generate pdf from csv",
    "mail merge",
    "docxtemplater",
    "open source document generator",
  ],
  applicationName: "Template Me",
  authors: [{ name: "modakoda", url: "https://modakoda.com" }],
  creator: "modakoda",
  publisher: "modakoda",
  category: "productivity",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title,
    description,
    siteName: "Template Me",
    type: "website",
    url: "/",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        {/* Set data-theme on <html> from the stored preference before first
         * paint, so the toggle can override the OS setting without a flash.
         * See node_modules/next/dist/docs/01-app/02-guides/preventing-flash-before-hydration.md */}
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-full flex flex-col">
        <div className="flex-1 flex flex-col">{children}</div>
        <footer className="py-6 text-center text-xs text-black/55 dark:text-white/40">
          Made by{" "}
          <a
            href="https://modakoda.com"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-foreground"
          >
            modakoda.com
          </a>
        </footer>
        <ThemeToggle />
      </body>
    </html>
  );
}
