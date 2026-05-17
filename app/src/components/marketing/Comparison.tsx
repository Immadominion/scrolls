"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useInView } from "framer-motion";
import { Check, Minus, X, Zap } from "lucide-react";

type FeatureStatus = "yes" | "no" | "partial";

interface Platform {
    name: string;
    tagline: string;
    features: Record<string, FeatureStatus>;
    highlight?: boolean;
}

const platforms: Platform[] = [
    {
        name: "Scrolls",
        tagline: "Forms on Walrus",
        highlight: true,
        features: {
            permanentStorage: "yes",
            noFees: "yes",
            encryption: "yes",
            aiAnalysis: "yes",
            fileUploads: "yes",
            onChain: "yes",
        },
    },
    {
        name: "Typeform",
        tagline: "SaaS form tool",
        features: {
            permanentStorage: "no",
            noFees: "no",
            encryption: "partial",
            aiAnalysis: "partial",
            fileUploads: "yes",
            onChain: "no",
        },
    },
    {
        name: "Google Forms",
        tagline: "Free form builder",
        features: {
            permanentStorage: "no",
            noFees: "yes",
            encryption: "no",
            aiAnalysis: "no",
            fileUploads: "partial",
            onChain: "no",
        },
    },
    {
        name: "Airtable",
        tagline: "Database + forms",
        features: {
            permanentStorage: "no",
            noFees: "no",
            encryption: "partial",
            aiAnalysis: "partial",
            fileUploads: "yes",
            onChain: "no",
        },
    },
];

const featureLabels: Record<string, string> = {
    permanentStorage: "Permanent storage",
    noFees: "No subscription",
    encryption: "Response encryption",
    aiAnalysis: "AI analysis",
    fileUploads: "File uploads",
    onChain: "On-chain record",
};

function StatusIcon({
    status,
    highlight,
}: {
    status: FeatureStatus;
    highlight?: boolean;
}) {
    if (status === "yes") {
        return (
            <div
                className={`flex h-6 w-6 items-center justify-center rounded-full ${highlight ? "bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.4)]" : "bg-emerald-500/20"}`}
            >
                <Check
                    className={`h-4 w-4 ${highlight ? "text-black" : "text-emerald-400"}`}
                    strokeWidth={3}
                />
            </div>
        );
    }

    if (status === "no") {
        return (
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-[color:var(--surface-solid)] opacity-50">
                <X className="h-3.5 w-3.5 text-[color:var(--text-primary)]/50" />
            </div>
        );
    }

    return (
        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-amber-500/10">
            <Minus className="h-3.5 w-3.5 text-amber-500" />
        </div>
    );
}

export default function Comparison() {
    const ref = useRef<HTMLElement>(null);
    const isInView = useInView(ref, { once: true, margin: "-100px" });
    const [activeFeature, setActiveFeature] = useState(0);
    const [isAutoPlaying, setIsAutoPlaying] = useState(true);

    useEffect(() => {
        if (!isInView || !isAutoPlaying) return;

        const interval = window.setInterval(() => {
            setActiveFeature((previous) => (previous + 1) % Object.keys(featureLabels).length);
        }, 2000);

        return () => window.clearInterval(interval);
    }, [isAutoPlaying, isInView]);

    return (
        <section ref={ref} className="relative px-6 py-24 sm:px-8 lg:py-28">
            <div className="pointer-events-none absolute inset-0 overflow-hidden">
                <motion.div
                    className="absolute left-1/4 top-1/2 h-[420px] w-[420px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-violet-500/[0.03] blur-[110px]"
                    animate={{
                        x: ["-50%", "-45%", "-50%"],
                        y: ["-50%", "-55%", "-50%"],
                    }}
                    transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
                />
                <motion.div
                    className="absolute right-1/4 top-1/3 h-[320px] w-[320px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-indigo-500/[0.03] blur-[90px]"
                    animate={{
                        x: ["-50%", "-55%", "-50%"],
                        y: ["-50%", "-45%", "-50%"],
                    }}
                    transition={{
                        duration: 10,
                        repeat: Infinity,
                        ease: "easeInOut",
                        delay: 1,
                    }}
                />
            </div>

            <div className="relative mx-auto max-w-6xl">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={isInView ? { opacity: 1, y: 0 } : {}}
                    transition={{ duration: 0.6 }}
                    className="mb-12 text-center"
                >
                    <h2 className="mb-3 font-display text-3xl font-bold tracking-tight text-[color:var(--text-primary)] sm:text-4xl md:text-[2.75rem]">
                        Not another form tool.
                    </h2>
                    <p className="mx-auto max-w-lg text-base text-[color:var(--text-primary)]/40 sm:text-[17px]">
                        Responses that outlive the platform. Compare for yourself.
                    </p>
                </motion.div>

                <div className="-mx-6 overflow-x-auto px-6 sm:-mx-0 sm:px-0 md:overflow-visible">
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={isInView ? { opacity: 1, scale: 1 } : {}}
                        transition={{ duration: 0.6, delay: 0.2 }}
                        className="relative grid min-w-[620px] grid-cols-4 gap-0 md:min-w-0 md:grid-cols-5"
                    >
                        <div className="col-span-1 hidden pt-24 md:block">
                            {Object.entries(featureLabels).map(([key, label], index) => (
                                <motion.div
                                    key={key}
                                    className={`flex h-14 cursor-pointer items-center px-3 text-[13px] font-medium transition-colors duration-300 ${activeFeature === index ? "text-[color:var(--text-primary)]" : "text-[color:var(--text-primary)]/40"}`}
                                    onMouseEnter={() => {
                                        setActiveFeature(index);
                                        setIsAutoPlaying(false);
                                    }}
                                    onMouseLeave={() => setIsAutoPlaying(true)}
                                    animate={activeFeature === index ? { x: [0, 4, 0] } : {}}
                                    transition={{ duration: 0.3 }}
                                >
                                    {label}
                                </motion.div>
                            ))}
                        </div>

                        {platforms.map((platform) => (
                            <div
                                key={platform.name}
                                className={`relative col-span-1 flex flex-col ${platform.highlight ? "z-10 -mx-1 md:mx-0" : ""}`}
                            >
                                {platform.highlight && (
                                    <motion.div
                                        className="absolute inset-0 rounded-2xl border border-violet-500/30 bg-zinc-900/60 shadow-[0_0_40px_rgba(139,92,246,0.1)] backdrop-blur-xl"
                                        layoutId="highlightBackground"
                                    />
                                )}

                                <div
                                    className={`relative flex h-24 flex-col items-center justify-center p-3 text-center md:h-26 ${platform.highlight ? "pt-6" : ""}`}
                                >
                                    {platform.highlight && (
                                        <div className="absolute top-0 -translate-y-1/2 rounded-full border border-violet-500/50 bg-zinc-900 px-3 py-1 shadow-[0_0_15px_rgba(139,92,246,0.5)]">
                                            <div className="flex items-center gap-1.5">
                                                <Zap className="h-3 w-3 fill-violet-400 text-violet-400" />
                                                <span className="text-[10px] font-bold uppercase tracking-wider text-[color:var(--text-primary)]">
                                                    Best Choice
                                                </span>
                                            </div>
                                        </div>
                                    )}

                                    <h3
                                        className={`font-bold ${platform.highlight ? "text-lg text-[color:var(--text-primary)] md:text-[1.15rem]" : "text-base text-[color:var(--text-muted)]"}`}
                                    >
                                        {platform.name}
                                    </h3>
                                    <p
                                        className={`mt-1 text-xs ${platform.highlight ? "text-violet-300/80" : "text-[color:var(--text-primary)]/20"}`}
                                    >
                                        {platform.tagline}
                                    </p>
                                </div>

                                {Object.keys(featureLabels).map((key, index) => (
                                    <motion.div
                                        key={key}
                                        className={`relative flex h-14 items-center justify-center border-b transition-all duration-300 ${platform.highlight ? "border-white/5" : "border-transparent"} ${activeFeature === index && platform.highlight ? "bg-violet-500/10" : ""} ${platform.highlight ? "" : index !== Object.keys(featureLabels).length - 1 ? "bg-[length:1px_100%] bg-right bg-no-repeat bg-gradient-to-b from-transparent via-white/[0.02] to-transparent" : ""}`}
                                        onMouseEnter={() => {
                                            setActiveFeature(index);
                                            setIsAutoPlaying(false);
                                        }}
                                        onMouseLeave={() => setIsAutoPlaying(true)}
                                        animate={activeFeature === index ? { scale: [1, 1.05, 1] } : {}}
                                        transition={{ duration: 0.3 }}
                                    >
                                        <StatusIcon
                                            status={platform.features[key]}
                                            highlight={platform.highlight && activeFeature === index}
                                        />
                                    </motion.div>
                                ))}

                                {platform.highlight && (
                                    <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 rounded-b-2xl bg-gradient-to-t from-violet-500/10 to-transparent" />
                                )}
                            </div>
                        ))}
                    </motion.div>
                </div>

                <motion.p
                    initial={{ opacity: 0 }}
                    animate={isInView ? { opacity: 1 } : {}}
                    transition={{ duration: 0.6, delay: 0.8 }}
                    className="mt-10 text-center text-xs text-[color:var(--text-primary)]/30 sm:text-sm"
                >
                    Responses are permanent here. The others still rent you the data layer.
                </motion.p>
            </div>
        </section>
    );
}