"use client";

import Link from "next/link";
import { useRef } from "react";
import { motion, useInView } from "framer-motion";

export default function FinalCTA() {
    const ref = useRef<HTMLElement>(null);
    const isInView = useInView(ref, { once: true, margin: "-100px" });

    return (
        <section ref={ref} className="relative overflow-hidden px-6 py-32 sm:px-8">
            <div className="pointer-events-none absolute inset-0">
                <div
                    className="absolute left-1/2 top-1/2 h-[800px] w-[800px] -translate-x-1/2 -translate-y-1/2 opacity-[0.05]"
                    style={{
                        background:
                            "radial-gradient(circle, rgba(139, 92, 246, 0.4) 0%, transparent 70%)",
                    }}
                />
            </div>

            <div className="relative mx-auto max-w-4xl text-center">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={isInView ? { opacity: 1, y: 0 } : {}}
                    transition={{ duration: 0.8 }}
                >
                    <h2 className="mb-6 font-display text-5xl font-bold leading-tight tracking-tight text-[color:var(--text-primary)] md:text-7xl">
                        Prompt the form.
                        <br />
                        <span className="text-violet-400">Own the responses.</span>
                    </h2>

                    <p className="mx-auto mb-12 max-w-xl text-xl leading-relaxed text-[color:var(--text-primary)]/50">
                        Start with AI or go straight to the builder. Walrus keeps the data layer
                        permanent.
                        <span className="font-medium text-[color:var(--text-primary)]"> Seal keeps private payloads private.</span>
                    </p>

                    <div className="flex flex-col items-center justify-center gap-6 sm:flex-row">
                        <Link
                            href="/builder"
                            className="group relative rounded-full bg-white px-8 py-4 text-lg font-semibold text-black shadow-[0_0_40px_rgba(255,255,255,0.1)] transition-all hover:bg-white/95 hover:shadow-[0_0_60px_rgba(255,255,255,0.2)]"
                        >
                            Open builder
                        </Link>

                        <Link
                            href="/dashboard"
                            className="px-8 py-4 text-lg font-medium text-[color:var(--text-primary)]/40 transition-colors hover:text-[color:var(--text-primary)]"
                        >
                            View dashboard
                        </Link>
                    </div>
                </motion.div>
            </div>
        </section>
    );
}