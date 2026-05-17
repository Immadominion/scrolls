"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import ScrollsLogo from "@/components/brand/ScrollsLogo";
import WalletButton from "@/components/wallet/WalletButton";

export default function Navigation() {
    return (
        <motion.nav
            initial={{ opacity: 0, y: -16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: [0.25, 0.4, 0.25, 1] }}
            className="fixed inset-x-0 top-0 z-50"
        >
            <div
                className="pointer-events-none absolute inset-x-0 top-0 h-20"
                style={{
                    background: "linear-gradient(180deg, var(--background-app) 0%, transparent 100%)",
                }}
            />

            <div className="relative mx-auto flex max-w-7xl items-center justify-between px-6 py-5 md:px-8">
                <Link href="/" className="flex items-center gap-3">
                    <ScrollsLogo className="h-8 w-8" />
                    <span className="font-display text-sm font-semibold tracking-tight text-[color:var(--text-primary)]">
                        Scrolls
                    </span>
                </Link>

                <div className="flex items-center gap-2 md:gap-8">
                    <a
                        href="/#features"
                        className="hidden text-sm text-[color:var(--text-secondary)] transition-colors duration-300 hover:text-[color:var(--text-primary)] md:inline"
                    >
                        Features
                    </a>
                    <a
                        href="/#how-it-works"
                        className="hidden text-sm text-[color:var(--text-secondary)] transition-colors duration-300 hover:text-[color:var(--text-primary)] md:inline"
                    >
                        How it works
                    </a>
                    <a
                        href="/#programmatic"
                        className="hidden text-sm text-[color:var(--text-secondary)] transition-colors duration-300 hover:text-[color:var(--text-primary)] md:inline"
                    >
                        Developers
                    </a>
                    <a
                        href="/docs"
                        className="hidden text-sm text-[color:var(--text-secondary)] transition-colors duration-300 hover:text-[color:var(--text-primary)] md:inline"
                    >
                        Docs
                    </a>
                    <Link
                        href="/dashboard"
                        className="hidden px-4 py-2 text-sm font-medium text-[color:var(--text-secondary)] transition-colors duration-300 hover:text-[color:var(--text-primary)] sm:inline-flex"
                    >
                        Dashboard
                    </Link>
                    <WalletButton className="text-sm" />
                    <Link
                        href="/builder"
                        className="hidden sm:inline-flex min-h-10 items-center rounded-full bg-[color:var(--brand-primary)] px-5 py-2 text-sm font-medium text-[color:var(--text-inverse)] transition-colors duration-200 hover:bg-[color:var(--brand-primary-hover)]"
                    >
                        Create form
                    </Link>
                </div>
            </div>
        </motion.nav>
    );
}