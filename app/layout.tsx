import "@/styles/globals.css";
import "@/styles/prosemirror.css";
import "katex/dist/katex.min.css";
import { GeistSans } from "geist/font/sans";

import { DesktopTitlebar } from "@/components/desktop-titlebar";
import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import Providers from "./providers";

const title = "Luman";
const description =
  "Luman is a team workspace for organizations: shared documents with an AI writing assistant, task lists, a team calendar, group chat, whiteboards, and a voice agent, all in one place.";

export const metadata: Metadata = {
  title,
  description,
  openGraph: {
    title,
    description,
  },
  twitter: {
    title,
    description,
    card: "summary_large_image",
  },
  keywords: ["Luman", "team workspace", "shared documents", "task management", "team calendar", "AI assistant"],
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
};

export const viewport: Viewport = {
  themeColor: "#ffffff",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={GeistSans.variable}>
        <DesktopTitlebar>
          <Providers>{children}</Providers>
        </DesktopTitlebar>
      </body>
    </html>
  );
}
