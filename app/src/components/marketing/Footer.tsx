"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import ScrollsLogo from "@/components/brand/ScrollsLogo";

export default function Footer() {
    return (
        <footer className="relative border-t border-white/[0.05] px-6 py-16 sm:px-8">
            <div className="mx-auto max-w-6xl">
                <div className="flex flex-col items-start justify-between gap-8 md:flex-row md:items-center">
                    <div className="flex flex-col gap-3">
                        <ScrollsLogo className="h-8 w-8" />
                        <p className="text-sm text-[color:var(--text-primary)]/40">Forms that outlive the platforms.</p>
                    </div>

                    <div className="flex gap-8 text-sm">
                        <a href="#features" className="text-[color:var(--text-primary)]/40 transition-colors hover:text-[color:var(--text-primary)]">
                            Features
                        </a>
                        <a
                            href="#how-it-works"
                            className="text-[color:var(--text-primary)]/40 transition-colors hover:text-[color:var(--text-primary)]"
                        >
                            How it works
                        </a>
                        <Link href="/builder" className="text-[color:var(--text-primary)]/40 transition-colors hover:text-[color:var(--text-primary)]">
                            Builder
                        </Link>
                    </div>
                </div>

                <motion.div
                    initial={{ opacity: 0 }}
                    whileInView={{ opacity: 1 }}
                    viewport={{ once: true }}
                    className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-white/[0.05] pt-8 text-xs text-[color:var(--text-primary)]/30 md:flex-row"
                >
                    <p>© 2026 Scrolls. Built with love on Walrus.</p>
                    <p>Android and iOS coming soon.</p>
                </motion.div>
            </div>
        </footer>
    );
}