"use client";

import { useState, useRef } from "react";
import { AnimatePresence, motion, useScroll, useTransform, useMotionValueEvent } from "framer-motion";
import { Icon } from "@iconify/react";
import { TrendingUp } from "lucide-react";

const StepVisual1 = () => (
    <div className="relative flex h-full w-full items-center justify-center p-8">
        <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: -20 }}
            transition={{ duration: 0.5 }}
            className="w-full max-w-sm overflow-hidden rounded-xl border border-[color:var(--border-subtle)] bg-zinc-900/90 shadow-2xl backdrop-blur-xl"
        >
            <div className="flex items-center gap-2 border-b border-white/5 bg-[color:var(--surface-solid)] px-4 py-3">
                <div className="flex gap-1.5">
                    <div className="h-2.5 w-2.5 rounded-full bg-red-500/20" />
                    <div className="h-2.5 w-2.5 rounded-full bg-yellow-500/20" />
                    <div className="h-2.5 w-2.5 rounded-full bg-green-500/20" />
                </div>
            </div>

            <div className="space-y-4 p-6">
                <motion.div
                    initial={{ width: "0%" }}
                    animate={{ width: "60%" }}
                    transition={{ delay: 0.2, duration: 0.8 }}
                    className="h-4 rounded bg-violet-500/20"
                />

                <div className="space-y-2">
                    {[100, 90, 95, 80].map((width, index) => (
                        <motion.div
                            key={width}
                            initial={{ width: "0%", opacity: 0 }}
                            animate={{ width: `${width}%`, opacity: 1 }}
                            transition={{ delay: 0.4 + index * 0.1, duration: 0.5 }}
                            className="h-2 rounded bg-[color:var(--surface-muted)]"
                        />
                    ))}
                </div>

                <motion.div
                    className="absolute -right-4 top-20 rounded-lg border border-[color:var(--border-subtle)] bg-zinc-800 p-3 shadow-lg"
                    animate={{ y: [0, -10, 0] }}
                    transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                >
                    <Icon icon="fluent:pen-sparkle-48-regular" className="h-6 w-6 text-violet-400" />
                </motion.div>
            </div>
        </motion.div>
    </div>
);

const StepVisual2 = () => (
    <div className="relative flex h-full w-full items-center justify-center p-8">
        <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.1 }}
            transition={{ duration: 0.5 }}
            className="relative"
        >
            <div className="relative flex h-64 w-52 flex-col items-center justify-between overflow-hidden rounded-2xl border border-[color:var(--border-subtle)] bg-gradient-to-b from-zinc-800/80 to-zinc-900/80 p-6 shadow-[0_0_50px_rgba(0,0,0,0.5)] backdrop-blur-md">
                <div className="absolute inset-0 skew-x-12 bg-gradient-to-tr from-transparent via-white/5 to-transparent opacity-50" />

                <div className="flex w-full items-center justify-between font-mono text-xs text-[color:var(--text-primary)]/30">
                    <span>LINK</span>
                    <span>LIVE</span>
                </div>

                <motion.div
                    animate={{ scale: [1, 1.05, 1] }}
                    transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                    className="relative flex h-24 w-24 items-center justify-center"
                >
                    <div className="absolute inset-0 rounded-full  border-violet-500/30 blur-[2px]" />
                    <div className="absolute inset-0 rounded-full border border-violet-400/50" />
                    <div className="flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-violet-600 to-indigo-700 shadow-inner">
                        <Icon icon="fluent:link-24-filled" className="h-10 w-10 text-[color:var(--text-primary)]" />
                    </div>
                </motion.div>

                <div className="w-full space-y-2">
                    <div className="flex items-center justify-between">
                        <div className="h-2 w-16 rounded-full bg-[color:var(--surface-muted)]" />
                        <div className="h-2 w-10 rounded-full bg-emerald-500/20" />
                    </div>
                    <div className="h-1.5 w-24 rounded-full bg-[color:var(--surface-solid)]" />
                </div>

                <div className="pointer-events-none absolute left-1/2 top-1/2 h-32 w-32 -translate-x-1/2 -translate-y-1/2 rounded-full bg-violet-500/20 blur-[40px]" />
            </div>
        </motion.div>
    </div>
);

const StepVisual3 = () => (
    <div className="relative flex h-full w-full items-center justify-center p-8">
        <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.05 }}
            transition={{ duration: 0.5 }}
            className="w-full max-w-sm"
        >
            <div className="rounded-xl border border-[color:var(--border-subtle)] bg-zinc-900/90 p-6 shadow-2xl backdrop-blur-xl">
                <div className="mb-6 flex items-center justify-between">
                    <span className="text-sm font-medium text-[color:var(--text-primary)]/40">Community Growth</span>
                    <div className="flex items-center gap-1.5 rounded-full border border-green-500/20 bg-green-500/10 px-2.5 py-1">
                        <TrendingUp className="h-3.5 w-3.5 text-green-400" />
                        <span className="text-xs font-bold text-green-400">+128%</span>
                    </div>
                </div>

                <div className="relative mb-4 flex h-40 w-full items-center justify-center">
                    <motion.div
                        className="relative z-10 flex h-12 w-12 items-center justify-center rounded-full bg-violet-500 shadow-[0_0_20px_rgba(139,92,246,0.5)]"
                        animate={{ scale: [1, 1.1, 1] }}
                        transition={{ duration: 2, repeat: Infinity }}
                    >
                        <Icon icon="fluent:people-community-24-filled" className="h-6 w-6 text-[color:var(--text-primary)]" />
                    </motion.div>

                    {[0, 60, 120, 180, 240, 300].map((angle, index) => (
                        <motion.div
                            key={angle}
                            className="absolute h-[2px] w-24 origin-left bg-gradient-to-r from-violet-500/50 to-transparent"
                            style={{
                                rotate: `${angle}deg`,
                                left: "50%",
                                top: "50%",
                            }}
                            initial={{ scaleX: 0 }}
                            animate={{ scaleX: 1 }}
                            transition={{ delay: index * 0.1, duration: 0.5 }}
                        />
                    ))}
                </div>
            </div>
        </motion.div>
    </div>
);

const steps = [
    {
        id: "build",
        title: "Build in the builder",
        description:
            "Open the drag-and-drop builder. Add fields like short text, dropdowns, uploads, star ratings, and rich text. Set the form to public or encrypted-private, then publish.",
        icon: "fluent:form-multiple-48-regular",
        visual: StepVisual1,
    },
    {
        id: "share",
        title: "Share your link",
        description:
            "Your form gets a permanent link at scrolls.fun/f/your-slug. Share it anywhere. Respondents can answer instantly without creating an account.",
        icon: "fluent:link-48-regular",
        visual: StepVisual2,
    },
    {
        id: "analyze",
        title: "Analyze forever",
        description:
            "Every submission is a Walrus blob, permanent and verifiable on Sui. The dashboard sorts responses, adds notes, and layers in AI analysis when you need it.",
        icon: "fluent:data-trending-24-regular",
        visual: StepVisual3,
    },
];

export default function CreatorFlow() {
    const [activeStep, setActiveStep] = useState(0);
    const containerRef = useRef<HTMLDivElement>(null);
    const contentRef = useRef<HTMLDivElement>(null);

    const { scrollYProgress } = useScroll({
        target: containerRef,
        offset: ["start center", "end center"]
    });

    useMotionValueEvent(scrollYProgress, "change", (latest) => {
        // Map 0 -> 1 progress to the 3 steps
        if (latest < 0.33) {
            setActiveStep(0);
        } else if (latest >= 0.33 && latest < 0.66) {
            setActiveStep(1);
        } else {
            setActiveStep(2);
        }
    });

    const ActiveVisual = steps[activeStep]?.visual ?? StepVisual1;

    return (
        <section id="how-it-works" className="relative bg-[#0a0a0a]" ref={containerRef}>
            {/* The scrollable track that creates scrolling distance, enabling pinning */}
            <div className="h-[300vh] w-full absolute inset-0 pointer-events-none" />

            <div className="sticky top-0 sticky-container overflow-hidden px-6 py-28 sm:px-8 lg:py-32 min-h-screen flex flex-col justify-center" ref={contentRef}>
                <div className="pointer-events-none absolute inset-x-0 top-0 h-full opacity-20">
                    <div className="absolute right-0 top-1/2 h-[600px] w-[600px] -translate-y-1/2 translate-x-1/2 rounded-full bg-violet-500/20 blur-[100px]" />
                    <div className="absolute bottom-0 left-0 h-[600px] w-[600px] translate-y-1/2 -translate-x-1/2 rounded-full bg-indigo-500/20 blur-[100px]" />
                </div>

                <div className="relative mx-auto w-full max-w-7xl relative z-10">
                    <div className="mb-14 max-w-2xl">
                        <h2 className="mb-6 font-display text-4xl font-bold tracking-tight text-[color:var(--text-primary)] md:text-5xl lg:text-6xl">
                            The full flow.
                            <br />
                            <span className="text-[color:var(--text-primary)]/40">Start to finish.</span>
                        </h2>
                        <p className="text-lg leading-relaxed text-[color:var(--text-primary)]/45">
                            Scrolls should read like one section here, not a long scrollytelling detour.
                            Pick a step and preview the flow inline.
                        </p>
                    </div>
                </div>

                <div className="grid grid-cols-1 items-stretch gap-10 lg:grid-cols-[minmax(0,0.95fr)_minmax(360px,0.9fr)] lg:gap-20">
                    <div className="grid gap-4">
                        {steps.map((step, index) => {
                            const isActive = activeStep === index;

                            // Let Framer transform fading so inactive text isn't entirely muted
                            const transitionClasses = `transition-all duration-500`;

                            return (
                                <button
                                    key={step.id}
                                    type="button"
                                    onClick={() => {
                                        // On click, scroll page to where this step pins
                                        const yPos = containerRef.current!.offsetTop + (window.innerHeight * index);
                                        window.scrollTo({ top: yPos, behavior: 'smooth' });
                                    }}
                                    className={`relative rounded-[28px] border px-6 py-6 text-left ${transitionClasses} ${isActive ? "border-violet-400/40 bg-violet-500/[0.08]" : "border-white/[0.08] bg-white/[0.02] hover:border-white/[0.14] hover:bg-white/[0.04]"}`}
                                >
                                    <div className="mb-4 flex items-center gap-4">
                                        <span
                                            className={`grid h-11 w-11 shrink-0 place-items-center rounded-full border ${transitionClasses} ${isActive ? "border-violet-400/40 bg-violet-500/15 text-violet-300" : "border-white/[0.08] bg-white/[0.04] text-[color:var(--text-primary)]/40"}`}
                                        >
                                            <Icon icon={step.icon} className="h-5 w-5" />
                                        </span>
                                        <div>
                                            <p className="text-xs uppercase tracking-[0.18em] text-[color:var(--text-primary)]/28">
                                                Step {index + 1}
                                            </p>
                                            <h3 className={`mt-1 text-2xl font-semibold transition-colors duration-300 ${isActive ? "text-[color:var(--text-primary)]" : "text-[color:var(--text-primary)]/40"}`}>
                                                {step.title}
                                            </h3>
                                        </div>
                                    </div>

                                    <div
                                        className={`overflow-hidden transition-all duration-500 ease-[0.25,0.4,0.25,1] ${isActive ? 'max-h-32 opacity-100 mt-4' : 'max-h-0 opacity-0 mt-0'}`}
                                    >
                                        <p className="max-w-xl text-base leading-7 text-[color:var(--text-muted)]">
                                            {step.description}
                                        </p>
                                    </div>
                                </button>
                            );
                        })}
                    </div>

                    <div className="flex h-full">
                        <div className="relative flex h-full w-full items-center justify-center overflow-hidden rounded-3xl border border-white/[0.08] bg-zinc-900/40 backdrop-blur-sm">
                            <AnimatePresence mode="wait">
                                <motion.div
                                    key={activeStep}
                                    initial={{ opacity: 0, y: 20, filter: "blur(10px)" }}
                                    animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                                    exit={{ opacity: 0, y: -20, filter: "blur(10px)" }}
                                    transition={{
                                        duration: 0.5,
                                        ease: [0.25, 0.1, 0.25, 1],
                                    }}
                                    className="absolute inset-0 flex items-center justify-center"
                                >
                                    <ActiveVisual />
                                </motion.div>
                            </AnimatePresence>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
}