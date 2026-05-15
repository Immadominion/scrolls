"use client";

import { useRef, useState, type ReactNode } from "react";
import { motion } from "framer-motion";
import { DotLottieReact, setWasmUrl } from "@lottiefiles/dotlottie-react";
import { BarChart3, Check } from "lucide-react";
import { Icon } from "@iconify/react";

// Self-host the WASM renderer instead of pulling it from unpkg/jsdelivr
// at runtime. This keeps the landing working under a strict CSP and on
// Walrus Sites where outbound CDN requests aren't guaranteed.
if (typeof window !== "undefined") {
    setWasmUrl("/dotlottie-player.wasm");
}

interface VisualProps {
    isHovered: boolean;
}

const FormBuilderVisual = ({ isHovered }: VisualProps) => (
    <div className="flex h-full w-full flex-col items-center justify-center gap-2 p-4">
        {[
            { label: "Bug title", type: "Short text", width: "w-full" },
            { label: "Severity", type: "Dropdown", width: "w-full" },
            { label: "Screenshot", type: "File upload", width: "w-full" },
            { label: "Description", type: "Rich text", width: "w-full" },
        ].map((field, index) => (
            <motion.div
                key={field.label}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.1 + index * 0.08, duration: 0.4 }}
                className={`flex items-center justify-between ${field.width} rounded-md border border-white/[0.07] bg-white/[0.03] px-3 py-1.5 ${isHovered && index === 2 ? "border-violet-500/40 bg-violet-500/5" : ""} transition-colors duration-300`}
            >
                <span className="text-[11px] text-[color:var(--text-muted)]">{field.label}</span>
                <span className="font-mono text-[9px] text-[color:var(--text-primary)]/25">{field.type}</span>
            </motion.div>
        ))}

        <motion.div
            animate={isHovered ? { scale: 1.02 } : { scale: 1 }}
            className="mt-0.5 flex w-full flex-1 min-h-0 items-center justify-center gap-1.5 rounded-md border border-dashed border-[color:var(--border-subtle)] bg-white/[0.06] py-1.5"
        >
            <Icon icon="fluent:add-circle-24-regular" className="h-4 w-4 text-[color:var(--text-primary)]/30" />
            <span className="text-xs text-[color:var(--text-primary)]/30">Add field</span>
        </motion.div>
    </div>
);

const WalrusStorageVisual = ({ isHovered }: VisualProps) => (
    <div className="flex h-full w-full items-center justify-center p-6">
        <div className="relative flex flex-col items-center gap-4">
            <div className="flex gap-3">
                {[0, 1, 2].map((index) => (
                    <motion.div
                        key={index}
                        animate={isHovered ? { y: [-4, 4, -4] } : { y: 0 }}
                        transition={{
                            duration: 2 + index * 0.5,
                            repeat: Infinity,
                            ease: "easeInOut",
                            delay: index * 0.3,
                        }}
                        className="flex h-12 w-12 items-center justify-center rounded-xl border border-blue-400/20 bg-blue-500/10"
                    >
                        <Icon icon="fluent:database-48-regular" className="h-5 w-5 text-blue-400/60" />
                    </motion.div>
                ))}
            </div>

            <div className="flex items-center gap-2 rounded-full border border-[color:var(--border-subtle)] bg-[color:var(--surface-solid)] px-3 py-1.5">
                <Check className="h-3 w-3 text-green-400" />
                <span className="text-xs text-[color:var(--text-muted)]">Stored on Walrus · permanent</span>
            </div>
        </div>
    </div>
);

const SealEncryptionVisual = ({ isHovered }: VisualProps) => (
    <div className="relative flex h-full w-full flex-col items-center justify-end p-4">
        <motion.div
            animate={isHovered ? { scale: 1.05 } : { scale: 1 }}
            transition={{ duration: 0.5, ease: [0.25, 0.4, 0.25, 1] }}
            className="absolute inset-0 flex items-center justify-center opacity-80"
        >
            <DotLottieReact src="/lock.lottie" loop autoplay className="h-[200px] w-auto max-w-full drop-shadow-2xl" />
        </motion.div>
        <div className="relative z-10 flex w-full flex-col items-center gap-1 rounded-xl border border-[color:var(--border-subtle)] bg-black/40 px-3 py-2 backdrop-blur-md">
            <span className="text-xs font-medium text-[color:var(--text-primary)]/90">End-to-end encrypted</span>
            <span className="font-mono text-[9px] text-[color:var(--text-muted)]">
                Only authorized readers can decrypt
            </span>
        </div>
    </div>
);

const DashboardVisual = ({ isHovered }: VisualProps) => (
    <div className="flex h-full w-full flex-col justify-center gap-1.5 p-4">
        {[
            {
                label: "Loading times too slow on devnet",
                tag: "Critical",
                color: "text-red-400 bg-red-500/10 border-red-500/20",
            },
            {
                label: "Dashboard filter not working",
                tag: "High",
                color: "text-orange-400 bg-orange-500/10 border-orange-500/20",
            },
            {
                label: "Add bulk export to CSV",
                tag: "Medium",
                color: "text-yellow-400 bg-yellow-500/10 border-yellow-500/20",
            },
        ].map((row, index) => (
            <motion.div
                key={row.label}
                initial={{ opacity: 0, x: 8 }}
                animate={{ opacity: isHovered ? 1 : 0.6, x: 0 }}
                transition={{ delay: index * 0.07, duration: 0.3 }}
                className="flex items-center justify-between rounded-md border border-white/[0.05] bg-white/[0.02] px-2.5 py-1.5"
            >
                <span className="max-w-[60%] truncate text-[11px] text-[color:var(--text-muted)]">{row.label}</span>
                <span className={`rounded-full border px-1.5 py-0.5 text-[9px] font-medium ${row.color}`}>
                    {row.tag}
                </span>
            </motion.div>
        ))}

        <div className="mt-1 flex items-center gap-2 px-1">
            <BarChart3 className="h-3 w-3 text-[color:var(--text-primary)]/20" />
            <span className="text-[9px] text-[color:var(--text-primary)]/25">24 submissions · 3 unread</span>
        </div>
    </div>
);

const AIAnalysisVisual = ({ isHovered }: VisualProps) => (
    <div className="relative flex h-full w-full flex-col items-center justify-end p-4">
        <motion.div
            animate={isHovered ? { scale: 1.05 } : { scale: 1 }}
            transition={{ duration: 0.5, ease: [0.25, 0.4, 0.25, 1] }}
            className="absolute inset-0 flex items-center justify-center opacity-60 mix-blend-screen"
        >
            <DotLottieReact src="/ai-analysis.lottie" loop autoplay className="opacity-80 h-[240px] w-auto max-w-full drop-shadow-2xl" />
        </motion.div>

        <div className="relative z-10 flex w-full flex-col gap-1.5 rounded-xl border border-[color:var(--border-subtle)] bg-black/40 p-2.5 backdrop-blur-md">
            {[
                ["Summary", "Tight and concise"],
                ["Topics", "Clustered automatically"],
                ["Priority", "Suggested, not forced"],
            ].map(([label, value]) => (
                <div key={label} className="flex items-center justify-between text-[9px] text-[color:var(--text-primary)]/70">
                    <span>{label}</span>
                    <span className="text-[color:var(--text-primary)]/90">{value}</span>
                </div>
            ))}
        </div>
    </div>
);

interface BentoCardProps {
    title: string;
    description: string;
    className?: string;
    children?: (props: VisualProps) => ReactNode;
}

function BentoCard({ title, description, className = "", children }: BentoCardProps) {
    const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
    const [isHovered, setIsHovered] = useState(false);
    const cardRef = useRef<HTMLDivElement>(null);

    function handleMouseMove(event: React.MouseEvent<HTMLDivElement>) {
        if (!cardRef.current) return;
        const rect = cardRef.current.getBoundingClientRect();
        setMousePosition({
            x: event.clientX - rect.left,
            y: event.clientY - rect.top,
        });
    }

    return (
        <motion.div
            ref={cardRef}
            initial={{ opacity: 0, scale: 0.96 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            onMouseMove={handleMouseMove}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            className={`group relative flex flex-col overflow-hidden rounded-3xl border border-white/[0.08] bg-zinc-900/50 transition-colors duration-300 hover:bg-zinc-900/80 ${className}`}
        >
            <div className="relative h-44 w-full overflow-hidden border-b border-white/[0.05] bg-white/[0.01]">
                <div
                    className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-500 group-hover:opacity-100"
                    style={{
                        background: `radial-gradient(400px circle at ${mousePosition.x}px ${mousePosition.y}px, rgba(139,92,246,0.06), transparent 40%)`,
                    }}
                />
                {children?.({ isHovered })}
            </div>

            <div className="flex flex-1 flex-col p-6">
                <h3 className="mb-2 text-base font-semibold tracking-tight text-[color:var(--text-primary)]">{title}</h3>
                <p className="text-sm leading-relaxed text-[color:var(--text-primary)]/45">{description}</p>
            </div>
        </motion.div>
    );
}

export default function BentoFeatures() {
    return (
        <section id="features" className="relative px-6 py-24 sm:px-8">
            <div className="mx-auto max-w-5xl">
                <div className="mb-16 text-center">
                    <h2 className="mb-4 font-display text-4xl font-bold tracking-tight text-[color:var(--text-primary)] md:text-5xl lg:text-6xl">
                        Built different.
                        <br />
                        <span className="bg-gradient-to-r from-violet-400 to-indigo-400 bg-clip-text text-transparent">
                            Stored forever.
                        </span>
                    </h2>
                    <p className="mx-auto max-w-xl text-lg text-[color:var(--text-primary)]/40">
                        Every Scrolls form is a permanent record. No SaaS vendor to trust. No
                        server to maintain.
                    </p>
                </div>

                <div className="grid grid-cols-1 gap-4 md:auto-rows-[280px] md:grid-cols-6">
                    <BentoCard
                        title="Drag-and-drop form builder"
                        description="Rich text, dropdowns, star ratings, checkboxes, file uploads, video, all field types. Configure inline. Preview instantly."
                        className="md:col-span-4"
                    >
                        {(props) => <FormBuilderVisual {...props} />}
                    </BentoCard>

                    <BentoCard
                        title="Walrus-native storage"
                        description="Every submission is a Walrus blob. Permanent, verifiable, yours."
                        className="md:col-span-2"
                    >
                        {(props) => <WalrusStorageVisual {...props} />}
                    </BentoCard>

                    <BentoCard
                        title="End-to-end encryption"
                        description="Private forms encrypt in the browser before upload. Only key holders can decrypt responses."
                        className="md:col-span-2"
                    >
                        {(props) => <SealEncryptionVisual {...props} />}
                    </BentoCard>

                    <BentoCard
                        title="Admin dashboard"
                        description="Sort, tag priority, leave notes, and export. Built for teams that act on feedback."
                        className="md:col-span-2"
                    >
                        {(props) => <DashboardVisual {...props} />}
                    </BentoCard>

                    <BentoCard
                        title="AI-assisted analysis"
                        description="Summaries, topic clustering, and priority suggestions, shaped by Claude Haiku."
                        className="md:col-span-2"
                    >
                        {(props) => <AIAnalysisVisual {...props} />}
                    </BentoCard>
                </div>
            </div>
        </section>
    );
}