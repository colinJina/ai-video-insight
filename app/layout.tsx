import type { Metadata } from "next";

import AuthModalProvider from "@/components/auth/AuthModalProvider";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI Video Insight",
  description: "An amber-toned AI workspace for turning video into searchable knowledge.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <AuthModalProvider>{children}</AuthModalProvider>
      </body>
    </html>
  );
}
