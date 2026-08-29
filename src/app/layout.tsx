import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const siteUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL
  ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  : process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : "http://localhost:3000";

const title = "Template Me — Turn Word Docs into Fillable PDF Templates";
const description =
  "Upload a .docx file with {{placeholder}} tags and Template Me turns it into a web form. Fill it in — one document at a time or in bulk from a CSV — and download a finished PDF.";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: title,
    template: "%s · Template Me",
  },
  description,
  keywords: [
    "docx to pdf",
    "word template",
    "document automation",
    "pdf generator",
    "bulk pdf generation",
    "mail merge",
  ],
  applicationName: "Template Me",
  openGraph: {
    title,
    description,
    siteName: "Template Me",
    type: "website",
    url: "/",
  },
  twitter: {
    card: "summary",
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
    >
      <body className="min-h-full flex flex-col">
        <div className="flex-1 flex flex-col">{children}</div>
        <footer className="py-6 text-center text-xs text-black/40 dark:text-white/40">
          Made by{" "}
          <a
            href="https://modakoda.com"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-black/60 dark:hover:text-white/60"
          >
            modakoda.com
          </a>
        </footer>
      </body>
    </html>
  );
}
