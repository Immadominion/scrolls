import type { Metadata } from "next";
import "./globals.css";
import Providers from "@/providers/Providers";
import ThemeProvider from "@/components/theme/ThemeProvider";
import { themeInitScript } from "@/lib/theme";

export const metadata: Metadata = {
    title: "Scrolls — Forms that live forever",
    description:
        "Build forms in seconds. Every response is stored permanently on Walrus. Private submissions are end-to-end encrypted in your browser.",
    icons: {
        icon: [
            { url: "/favicon.ico" },
        ],
    },
    openGraph: {
        title: "Scrolls — Forms that live forever",
        description: "Walrus-native form builder. Permanent storage. End-to-end encrypted private submissions.",
        siteName: "Scrolls",
    },
};

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    const isDev = process.env.NODE_ENV !== "production";
    const scriptSrc = isDev
        // Turbopack HMR uses eval() in development.
        ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
        : "script-src 'self' 'unsafe-inline'";

    const csp = [
        "default-src 'self'",
        "base-uri 'self'",
        "object-src 'none'",
        "frame-ancestors 'none'",
        "form-action 'self'",
        // Next.js static export injects inline <script> blocks for the
        // hydration payload (`__next_f.push(...)`) and there is no SSR
        // step where we could attach a per-request nonce. Allowing
        // 'unsafe-inline' for scripts is the only workable option for
        // `output: 'export'`. We compensate by sanitizing every piece
        // of untrusted HTML through DOMPurify before render and never
        // using `eval` / `new Function` anywhere in the codebase.
        scriptSrc,
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
        "font-src 'self' https://fonts.gstatic.com data:",
        "img-src 'self' data: blob: https://aggregator.walrus-testnet.walrus.space https://aggregator.walrus.space",
        "media-src 'self' data: blob: https://aggregator.walrus-testnet.walrus.space https://aggregator.walrus.space",
        // Connect targets:
        //   - Walrus testnet+mainnet aggregators/publishers (storage)
        //   - Sui fullnodes (testnet+mainnet — devnet dropped, unused in prod)
        //   - Cloudflare Worker URL (AI proxy) and localhost:8787 for dev
        //   - api.iconify.design for the icon set; mirrors removed (unused)
        [
            "connect-src 'self'",
            isDev ? "http://localhost:8787 http://127.0.0.1:8787" : "",
            "https://publisher.walrus-testnet.walrus.space https://aggregator.walrus-testnet.walrus.space",
            "https://publisher.walrus.space https://aggregator.walrus.space",
            "https://fullnode.testnet.sui.io https://fullnode.mainnet.sui.io",
            "https://api.iconify.design",
            "https://*.workers.dev",
        ].filter(Boolean).join(" "),
        "worker-src 'self' blob:",
    ].join("; ");

    return (
        <html lang="en" className="h-full antialiased" data-theme="dark" suppressHydrationWarning>
            <head>
                <meta httpEquiv="Content-Security-Policy" content={csp} />
                <script id="scrolls-theme-script" dangerouslySetInnerHTML={{ __html: themeInitScript }} />
                <link rel="preconnect" href="https://fonts.googleapis.com" />
                <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
                <link
                    href="https://fonts.googleapis.com/css2?family=Inter:wght@100..900&family=Syne:wght@400;500;600;700;800&display=swap"
                    rel="stylesheet"
                />
            </head>
            <body className="min-h-full flex flex-col bg-[color:var(--background-app)] text-[color:var(--text-primary)]">
                <ThemeProvider>
                    <Providers>{children}</Providers>
                </ThemeProvider>
            </body>
        </html>
    );
}
