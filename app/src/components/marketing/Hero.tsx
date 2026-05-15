"use client";

import { useGlobalDrop } from "@/lib/useGlobalDrop";
import { FormEvent, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, useReducedMotion } from "framer-motion";
import { Icon } from "@iconify/react";
import MouseGlow from "@/components/ui/MouseGlow";
import DotGrid from "@/components/ui/DotGrid";
import { validateAttachments } from "@/lib/ai-attachments";
import { saveAIDraft } from "@/lib/ai-draft-storage";
import {
    createLiveTranscriber,
    isLiveTranscriptionSupported,
    type LiveTranscriber,
} from "@/lib/liveTranscription";

const CLAUDE_PROXY_URL = process.env.NEXT_PUBLIC_CLAUDE_PROXY_URL ?? "";
const TRANSCRIBE_PROXY_URL = toTranscribeProxyUrl(CLAUDE_PROXY_URL);

const AI_EXAMPLES = [
    "Bug report with severity, wallet, and screenshots",
    "Grant application with team, repo, milestone, and ask",
    "Hiring form with portfolio, timezone, and case study",
    "Feedback survey with rating, requests, and screenshots",
    "RSVP form with names, dietary needs, and plus-one",
];

const ATTACH_ACCEPT = [
    "image/*",
    "audio/*",
    "video/*",
    ".pdf",
    ".md",
    ".txt",
    ".doc",
    ".docx",
].join(",");

const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
        opacity: 1,
        transition: {
            staggerChildren: 0.12,
            delayChildren: 0.1,
        },
    },
};

const itemVariants = {
    hidden: { opacity: 0, y: 16 },
    visible: {
        opacity: 1,
        y: 0,
        transition: {
            duration: 0.7,
            ease: [0.25, 0.4, 0.25, 1] as const,
        },
    },
};

export default function Hero() {
    const router = useRouter();
    const prefersReducedMotion = useReducedMotion();
    const [isLoaded, setIsLoaded] = useState(false);
    const [prompt, setPrompt] = useState("");
    const [attachments, setAttachments] = useState<File[]>([]);
    const [menuOpen, setMenuOpen] = useState(false);

    const [voiceState, setVoiceState] = useState<"idle" | "recording" | "transcribing">("idle");
    const [voiceError, setVoiceError] = useState<string | null>(null);
    const [submitState, setSubmitState] = useState<"idle" | "saving">("idle");
    const [submitError, setSubmitError] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const menuWrapRef = useRef<HTMLDivElement>(null);

    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const mediaStreamRef = useRef<MediaStream | null>(null);
    const audioChunksRef = useRef<Blob[]>([]);
    // Live-transcription plumbing: snapshot prompt at record-start, stream
    // partial results into the textarea, then swap with Whisper's accurate
    // final pass on stop. The live segment is delimited so we can replace it.
    const liveTranscriberRef = useRef<LiveTranscriber | null>(null);
    const promptBaselineRef = useRef<string>("");
    const liveSegmentRef = useRef<string>("");
    const animatedPlaceholder = useTypewriter(AI_EXAMPLES, {
        paused: prompt.length > 0,
        disabled: !!prefersReducedMotion,
    });

    useEffect(() => {
        setIsLoaded(true);
    }, []);

    useEffect(() => {
        const textarea = textareaRef.current;
        if (!textarea) return;
        textarea.style.height = "0px";
        textarea.style.height = `${Math.min(textarea.scrollHeight, 240)}px`;
    }, [prompt]);

    useEffect(() => {
        if (!menuOpen) return;

        function handlePointerDown(event: MouseEvent) {
            if (!menuWrapRef.current?.contains(event.target as Node)) {
                setMenuOpen(false);
            }
        }

        function handleKeyDown(event: KeyboardEvent) {
            if (event.key === "Escape") {
                setMenuOpen(false);
            }
        }

        document.addEventListener("mousedown", handlePointerDown);
        document.addEventListener("keydown", handleKeyDown);

        return () => {
            document.removeEventListener("mousedown", handlePointerDown);
            document.removeEventListener("keydown", handleKeyDown);
        };
    }, [menuOpen]);

    useEffect(() => {
        return () => {
            stopAudioCapture(mediaRecorderRef, mediaStreamRef);
            liveTranscriberRef.current?.abort();
            liveTranscriberRef.current = null;
        };
    }, []);

    // Compose the baseline + live segment into the textarea on every partial.
    function pushLivePrompt(segment: string) {
        liveSegmentRef.current = segment;
        const baseline = promptBaselineRef.current.trim();
        if (!segment) {
            setPrompt(baseline);
            return;
        }
        setPrompt(baseline ? `${baseline}\n${segment}` : segment);
    }

    // Replace the live segment with the accurate Whisper transcript.
    function commitFinalPrompt(transcript: string) {
        const baseline = promptBaselineRef.current.trim();
        const cleaned = transcript.trim();
        liveSegmentRef.current = "";
        if (!cleaned) {
            setPrompt(baseline);
            return;
        }
        setPrompt(baseline ? `${baseline}\n${cleaned}` : cleaned);
    }

    async function handleSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setSubmitError(null);
        const finalPrompt = prompt.trim() || animatedPlaceholder.fullCurrent;
        if (!finalPrompt) return;

        if (attachments.length > 0) {
            const validationError = validateAttachments(attachments);
            if (validationError) {
                setSubmitError(validationError);
                return;
            }

            setSubmitState("saving");
            try {
                const draftId = await saveAIDraft(finalPrompt, attachments);
                const params = new URLSearchParams();
                params.set("mode", "ai");
                params.set("draft", draftId);
                router.push(`/builder?${params.toString()}`);
                return;
            } catch (error) {
                setSubmitState("idle");
                setSubmitError(
                    error instanceof Error
                        ? error.message
                        : "Failed to save AI draft with attachments.",
                );
                return;
            }
        }

        const params = new URLSearchParams();
        params.set("prompt", finalPrompt);
        params.set("mode", "ai");
        router.push(`/builder?${params.toString()}`);
    }

    function handleFiles(list: FileList | null) {
        if (!list) return;
        const incoming = Array.from(list);
        setAttachments((prev) => {
            const next = [...prev, ...incoming].slice(0, 6);
            const validationError = validateAttachments(next);
            if (validationError) {
                setSubmitError(validationError);
                return prev;
            }
            setSubmitError(null);
            setMenuOpen(false);
            return next;
        });
    }

    function removeAttachment(index: number) {
        setAttachments((prev) => prev.filter((_, i) => i !== index));
    }

    const isDropTarget = useGlobalDrop(handleFiles);

    function handlePaste(event: React.ClipboardEvent<HTMLTextAreaElement>) {
        if (!event.clipboardData.files.length) return;
        handleFiles(event.clipboardData.files);
    }

    function fillWithCurrentExample() {
        setPrompt(animatedPlaceholder.fullCurrent);
        setMenuOpen(false);
        textareaRef.current?.focus();
    }

    async function transcribeAudio(audioBlob: Blob) {
        if (!TRANSCRIBE_PROXY_URL) {
            setVoiceState("idle");
            setVoiceError("Set the AI proxy URL to enable Whisper voice input.");
            return;
        }

        setVoiceError(null);
        setVoiceState("transcribing");

        try {
            const mimeType = audioBlob.type || "audio/webm";
            const extension = mimeType.includes("mp4") || mimeType.includes("m4a")
                ? "m4a"
                : mimeType.includes("ogg")
                    ? "ogg"
                    : "webm";

            const formData = new FormData();
            formData.set(
                "file",
                new File([audioBlob], `scrolls-voice-note.${extension}`, {
                    type: mimeType,
                }),
            );

            const response = await fetch(TRANSCRIBE_PROXY_URL, {
                method: "POST",
                body: formData,
            });

            const result = (await response.json()) as { text?: string; error?: string };
            if (!response.ok) {
                throw new Error(result.error ?? "Whisper transcription failed.");
            }

            const transcript = result.text?.trim();
            if (!transcript) {
                throw new Error("Whisper returned an empty transcript.");
            }

            // Replace the live partial segment with Whisper's accurate pass.
            commitFinalPrompt(transcript);
            setVoiceState("idle");
            textareaRef.current?.focus();
        } catch (error) {
            setVoiceState("idle");
            setVoiceError(
                error instanceof Error ? error.message : "Could not transcribe audio.",
            );
        }
    }

    async function handleVoiceInput() {
        setMenuOpen(false);

        if (voiceState === "transcribing") {
            return;
        }

        if (voiceState === "recording") {
            // Stop both the live recognizer and the MediaRecorder. Whisper
            // takes over from the MediaRecorder onstop handler.
            liveTranscriberRef.current?.stop();
            liveTranscriberRef.current = null;
            mediaRecorderRef.current?.stop();
            return;
        }

        if (!TRANSCRIBE_PROXY_URL) {
            setVoiceError("Set the AI proxy URL to enable Whisper voice input.");
            return;
        }

        if (
            typeof window === "undefined" ||
            typeof MediaRecorder === "undefined" ||
            !navigator.mediaDevices?.getUserMedia
        ) {
            setVoiceError("This browser cannot record audio.");
            return;
        }

        try {
            setVoiceError(null);
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const mimeType = pickRecordingMimeType();
            const recorder = mimeType
                ? new MediaRecorder(stream, { mimeType })
                : new MediaRecorder(stream);

            mediaStreamRef.current = stream;
            mediaRecorderRef.current = recorder;
            audioChunksRef.current = [];

            // Snapshot the prompt so live partials append cleanly without
            // clobbering whatever the user already typed.
            promptBaselineRef.current = prompt;
            liveSegmentRef.current = "";

            // Start the live Web-Speech transcriber in parallel. If the
            // browser lacks SpeechRecognition (e.g. Firefox), we silently
            // fall back to Whisper-only after stop.
            if (isLiveTranscriptionSupported()) {
                const transcriber = createLiveTranscriber({
                    onTranscript: (text) => pushLivePrompt(text),
                    onError: (err) => {
                        // Recognition errors aren't fatal — Whisper still runs
                        // when the user stops. Surface only on first error.
                        if (!voiceError) {
                            setVoiceError(`Live transcription paused (${err}). Whisper will finalize on stop.`);
                        }
                    },
                });
                if (transcriber) {
                    liveTranscriberRef.current = transcriber;
                    try {
                        await transcriber.start();
                    } catch {
                        // Permission/start failure — fall back to Whisper-only.
                        liveTranscriberRef.current = null;
                    }
                }
            }

            recorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    audioChunksRef.current.push(event.data);
                }
            };

            recorder.onerror = () => {
                stopAudioCapture(mediaRecorderRef, mediaStreamRef);
                liveTranscriberRef.current?.abort();
                liveTranscriberRef.current = null;
                setVoiceState("idle");
                setVoiceError("Could not record audio.");
            };

            recorder.onstop = () => {
                const audioBlob = new Blob(audioChunksRef.current, {
                    type: recorder.mimeType || mimeType || "audio/webm",
                });

                stopAudioCapture(mediaRecorderRef, mediaStreamRef);
                liveTranscriberRef.current?.stop();
                liveTranscriberRef.current = null;

                if (audioBlob.size === 0) {
                    setVoiceState("idle");
                    setVoiceError("No audio was captured. Try again.");
                    return;
                }

                void transcribeAudio(audioBlob);
            };

            recorder.start();
            setVoiceState("recording");
        } catch (error) {
            stopAudioCapture(mediaRecorderRef, mediaStreamRef);
            liveTranscriberRef.current?.abort();
            liveTranscriberRef.current = null;
            setVoiceState("idle");
            setVoiceError(
                error instanceof Error && /denied|permission/i.test(error.message)
                    ? "Microphone access was denied."
                    : "Could not start the microphone.",
            );
        }
    }

    return (
        <section className="relative flex min-h-screen w-full items-center justify-center overflow-hidden px-6 pb-20 pt-28 sm:px-8">
            <DotGrid />

            <div
                className="pointer-events-none absolute inset-0 opacity-[0.08]"
                style={{
                    backgroundImage:
                        'url("data:image/svg+xml,%3Csvg viewBox=\'0 0 256 256\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'noiseFilter\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.9\' numOctaves=\'4\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23noiseFilter)\'/%3E%3C/svg%3E")',
                }}
            />

            <div className="pointer-events-none absolute inset-0 opacity-[0.05]">
                <div
                    className="h-full w-full"
                    style={{
                        backgroundImage:
                            "linear-gradient(var(--border-subtle) 1px, transparent 1px), linear-gradient(90deg, var(--border-subtle) 1px, transparent 1px)",
                        backgroundSize: "72px 72px",
                    }}
                />
            </div>

            <MouseGlow intensity="medium" />

            <div className="relative z-10 mx-auto w-full max-w-5xl text-center">
                <motion.div
                    variants={containerVariants}
                    initial="hidden"
                    animate={isLoaded ? "visible" : "hidden"}
                >
                    <motion.h1
                        variants={itemVariants}
                        className="mb-6 font-display text-4xl font-bold leading-[1.02] tracking-[-0.04em] text-[color:var(--text-primary)] sm:text-5xl md:text-6xl lg:text-7xl"
                    >
                        <span className="text-[color:var(--text-primary)]">Describe the form.</span>
                        <br />
                        <span className="text-[color:var(--text-primary)]/92">Publish it</span>{" "}
                        <span className="text-violet-400">forever.</span>
                    </motion.h1>

                    <motion.p
                        variants={itemVariants}
                        className="mx-auto mb-12 max-w-2xl text-lg font-light leading-relaxed text-[color:var(--text-primary)]/50 sm:text-xl"
                    >
                        Keep every response on Walrus.
                        <span className="text-[color:var(--text-primary)]/72"> {'\n'}Private ones stay end-to-end encrypted.</span>
                    </motion.p>

                    <motion.form
                        variants={itemVariants}
                        onSubmit={handleSubmit}
                        className={`relative mx-auto max-w-4xl rounded-[32px] border bg-[color:var(--surface-raised)] p-3 shadow-[var(--shadow-panel)] backdrop-blur-xl transition-[border-color,background-color,box-shadow] duration-200 ${isDropTarget
                            ? "border-[color:var(--brand-primary)] shadow-[var(--shadow-panel),0_0_0_1px_rgba(139,92,246,0.3)]"
                            : "border-[color:var(--border-default)] focus-within:border-[color:var(--brand-primary-soft)] focus-within:shadow-[var(--shadow-panel),0_0_0_1px_rgba(167,139,250,0.16)]"}`}
                    >
                        {isDropTarget && (
                            <div className="pointer-events-none absolute inset-3 z-10 rounded-[26px] border border-dashed border-[color:var(--brand-primary)] bg-[color:var(--brand-primary-soft)]/70" />
                        )}

                        <label htmlFor="landing-ai-prompt" className="sr-only">
                            Describe the form you want to create
                        </label>

                        <div className="flex flex-col overflow-hidden rounded-[26px] border border-[color:var(--border-subtle)] bg-[color:var(--background-subtle)] transition-[border-color,background-color] duration-200 focus-within:border-[color:var(--brand-primary-soft)] focus-within:bg-[color:var(--surface-panel)]">
                            <textarea
                                id="landing-ai-prompt"
                                ref={textareaRef}
                                value={prompt}
                                onChange={(event) => setPrompt(event.target.value)}
                                onPaste={handlePaste}
                                rows={1}
                                placeholder={animatedPlaceholder.display}
                                onKeyDown={(event) => {
                                    if (event.key === "Tab" && !event.shiftKey && !prompt.trim()) {
                                        event.preventDefault();
                                        fillWithCurrentExample();
                                        return;
                                    }
                                    if (event.key === "Enter" && !event.shiftKey) {
                                        event.preventDefault();
                                        event.currentTarget.form?.requestSubmit();
                                    }
                                }}
                                className="block min-h-[84px] w-full max-h-60 resize-none border-0 bg-transparent px-5 pb-4 pt-5 text-base leading-8 text-[color:var(--text-primary)] outline-none focus:ring-0 focus-visible:outline-none placeholder:text-[color:var(--text-primary)]/25 sm:text-lg"
                            />
                        </div>

                        {attachments.length > 0 && (
                            <div className="mt-2 flex flex-wrap gap-2 px-3">
                                {attachments.map((file, index) => (
                                    <span
                                        key={`${file.name}-${index}`}
                                        className="inline-flex items-center gap-2 rounded-full border border-[color:var(--border-default)] bg-[color:var(--surface-muted)] px-3 py-1.5 text-xs text-[color:var(--text-secondary)]"
                                    >
                                        <Icon icon="fluent:document-16-regular" width={14} />
                                        <span className="max-w-[180px] truncate">{file.name}</span>
                                        <button
                                            type="button"
                                            onClick={() => removeAttachment(index)}
                                            aria-label={`Remove ${file.name}`}
                                            className="grid h-5 w-5 place-items-center rounded-full text-[color:var(--text-primary)]/35 transition-colors duration-200 hover:text-[color:var(--text-primary)]"
                                        >
                                            <Icon icon="fluent:dismiss-12-filled" width={12} />
                                        </button>
                                    </span>
                                ))}
                            </div>
                        )}

                        <div className="mt-4 flex flex-col gap-3 px-2 pt-1 sm:flex-row sm:items-center sm:justify-between">
                            <div ref={menuWrapRef} className="relative flex flex-wrap items-center gap-3">
                                <button
                                    type="button"
                                    onClick={() => setMenuOpen((prev) => !prev)}
                                    aria-haspopup="menu"
                                    aria-expanded={menuOpen}
                                    aria-controls="hero-context-menu"
                                    className="inline-flex min-h-11 items-center gap-2 rounded-full border border-[color:var(--border-default)] bg-[color:var(--background-subtle)] pl-2 pr-4 text-sm font-medium text-[color:var(--text-secondary)] transition-colors duration-200 hover:border-[color:var(--border-strong)] hover:text-[color:var(--text-primary)]"
                                >
                                    <span className="grid h-8 w-8 place-items-center rounded-full bg-[color:var(--background-subtle)] text-[color:var(--text-primary)]/80">
                                        <Icon icon="fluent:add-12-filled" width={18} />
                                    </span>
                                    <span>Add context</span>
                                </button>

                                {isDropTarget && (
                                    <p className="text-xs text-[color:var(--brand-primary)]">
                                        Drop files to attach them as context
                                    </p>
                                )}

                                <button
                                    type="button"
                                    onClick={() => void handleVoiceInput()}
                                    aria-pressed={voiceState === "recording"}
                                    aria-label={
                                        voiceState === "recording"
                                            ? "Stop Whisper voice input"
                                            : "Start Whisper voice input"
                                    }
                                    title="Voice Input (Whisper)"
                                    className={`grid h-11 w-11 shrink-0 place-items-center rounded-full transition-colors duration-200 ${voiceState === "recording"
                                        ? "bg-rose-500/18 text-rose-500 hover:bg-rose-500/25"
                                        : voiceState === "transcribing"
                                            ? "bg-[color:var(--brand-secondary-soft)] text-[color:var(--brand-secondary)]"
                                            : "text-[color:var(--text-secondary)] hover:bg-[color:var(--background-subtle)] hover:text-[color:var(--text-primary)]"}`}
                                >
                                    <Icon
                                        icon={voiceState === "idle" ? "fluent:mic-20-regular" : "fluent:mic-20-filled"}
                                        width={20}
                                    />
                                </button>

                                {menuOpen && (
                                    <div
                                        id="hero-context-menu"
                                        role="menu"
                                        className="absolute bottom-[calc(100%+0.75rem)] left-0 z-20 w-[280px] rounded-[28px] border border-[color:var(--border-default)] bg-[color:var(--surface-panel-strong)] p-2 text-left shadow-[var(--shadow-panel)] backdrop-blur-2xl"
                                    >
                                        <button
                                            type="button"
                                            role="menuitem"
                                            onClick={() => {
                                                fileInputRef.current?.click();
                                            }}
                                            className="flex w-full items-start gap-3 rounded-[20px] px-3 py-3 text-left transition-colors duration-200 hover:bg-[color:var(--background-subtle)]"
                                        >
                                            <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[color:var(--background-subtle)] text-[color:var(--text-primary)]/80">
                                                <Icon icon="fluent:attach-24-regular" width={18} />
                                            </span>
                                            <span>
                                                <span className="block text-sm font-medium text-[color:var(--text-primary)]">Upload files</span>
                                                <span className="mt-0.5 block text-xs leading-5 text-[color:var(--text-primary)]/45">
                                                    Images, PDFs, and text files will be sent as Claude context.
                                                </span>
                                            </span>
                                        </button>

                                        <button
                                            type="button"
                                            role="menuitem"
                                            onClick={fillWithCurrentExample}
                                            className="flex w-full items-start gap-3 rounded-[20px] px-3 py-3 text-left transition-colors duration-200 hover:bg-[color:var(--background-subtle)]"
                                        >
                                            <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[color:var(--background-subtle)] text-[color:var(--text-primary)]/80">
                                                <Icon icon="fluent:sparkle-24-regular" width={18} />
                                            </span>
                                            <span>
                                                <span className="block text-sm font-medium text-[color:var(--text-primary)]">Use current example</span>
                                                <span className="mt-0.5 block text-xs leading-5 text-[color:var(--text-primary)]/45">
                                                    Drop the animated hint into the prompt so you can edit it directly.
                                                </span>
                                            </span>
                                        </button>

                                        {attachments.length > 0 && (
                                            <button
                                                type="button"
                                                role="menuitem"
                                                onClick={() => {
                                                    setAttachments([]);
                                                    setMenuOpen(false);
                                                }}
                                                className="flex w-full items-start gap-3 rounded-[20px] px-3 py-3 text-left transition-colors duration-200 hover:bg-[color:var(--background-subtle)]"
                                            >
                                                <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[color:var(--background-subtle)] text-[color:var(--text-primary)]/80">
                                                    <Icon icon="fluent:dismiss-circle-24-regular" width={18} />
                                                </span>
                                                <span>
                                                    <span className="block text-sm font-medium text-[color:var(--text-primary)]">Clear attachments</span>
                                                    <span className="mt-0.5 block text-xs leading-5 text-[color:var(--text-primary)]/45">
                                                        Remove the files you already attached to this draft.
                                                    </span>
                                                </span>
                                            </button>
                                        )}
                                    </div>
                                )}

                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    multiple
                                    accept={ATTACH_ACCEPT}
                                    onChange={(event) => {
                                        handleFiles(event.target.files);
                                        event.target.value = "";
                                    }}
                                    className="hidden"
                                />
                            </div>

                            <button
                                type="submit"
                                aria-label="Generate form"
                                disabled={submitState === "saving"}
                                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-violet-400 px-5 py-3 text-sm font-semibold text-zinc-950 transition-colors duration-200 hover:bg-violet-300 disabled:opacity-60 disabled:cursor-not-allowed"
                            >
                                {submitState === "saving" ? "Saving draft..." : "Generate form"}
                                {submitState === "saving" ? (
                                    <Icon icon="fluent:spinner-ios-20-regular" className="animate-spin" width={18} />
                                ) : (
                                    <Icon icon="fluent:arrow-up-16-filled" width={18} />
                                )}
                            </button>
                        </div>

                        {submitError && (
                            <p className="px-3 pt-3 text-left text-xs text-rose-300">
                                {submitError}
                            </p>
                        )}
                    </motion.form>

                    <motion.div
                        variants={itemVariants}
                        className="mt-6 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-sm text-[color:var(--text-primary)]/35"
                    >
                        <span>Press Enter to generate.</span>
                        <span className="text-[color:var(--text-primary)]/18">·</span>
                        <span>Shift + Enter for a new line.</span>
                        <span className="text-[color:var(--text-primary)]/18">·</span>
                        <Link
                            href="/builder"
                            className="text-[color:var(--text-primary)]/60 underline-offset-4 transition-colors duration-200 hover:text-[color:var(--text-primary)] hover:underline"
                        >
                            Skip and build manually
                        </Link>
                    </motion.div>

                    <motion.p variants={itemVariants} className="mt-6 text-sm text-[color:var(--text-primary)]/34">
                        Android and iOS apps coming soon.
                    </motion.p>
                </motion.div>
            </div>
        </section>
    );
}

interface TypewriterState {
    display: string;
    fullCurrent: string;
}

function toTranscribeProxyUrl(proxyUrl: string): string {
    if (!proxyUrl) {
        return "";
    }

    try {
        return new URL("/transcribe", proxyUrl).toString();
    } catch {
        return "";
    }
}

function pickRecordingMimeType(): string | undefined {
    if (typeof MediaRecorder === "undefined") {
        return undefined;
    }

    return ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find((mimeType) =>
        MediaRecorder.isTypeSupported(mimeType),
    );
}

function stopAudioCapture(
    mediaRecorderRef: { current: MediaRecorder | null },
    mediaStreamRef: { current: MediaStream | null },
) {
    mediaRecorderRef.current = null;
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    mediaStreamRef.current = null;
}

function useTypewriter(
    phrases: readonly string[],
    options: {
        paused?: boolean;
        disabled?: boolean;
        typeMs?: number;
        deleteMs?: number;
        holdMs?: number;
    } = {},
): TypewriterState {
    const {
        paused = false,
        disabled = false,
        typeMs = 38,
        deleteMs = 18,
        holdMs = 1600,
    } = options;
    const [phraseIndex, setPhraseIndex] = useState(0);
    const [text, setText] = useState(disabled ? phrases[0] ?? "" : "");
    const [phase, setPhase] = useState<"typing" | "deleting">("typing");

    useEffect(() => {
        if (phrases.length === 0) {
            return;
        }

        if (disabled) {
            setText(phrases[phraseIndex] ?? "");
            return;
        }

        if (paused) {
            return;
        }

        const current = phrases[phraseIndex] ?? "";

        if (phase === "typing") {
            if (text.length < current.length) {
                const timeout = window.setTimeout(() => {
                    setText(current.slice(0, text.length + 1));
                }, typeMs);
                return () => window.clearTimeout(timeout);
            }

            const timeout = window.setTimeout(() => {
                setPhase("deleting");
            }, holdMs);
            return () => window.clearTimeout(timeout);
        }

        if (text.length > 0) {
            const timeout = window.setTimeout(() => {
                setText(current.slice(0, text.length - 1));
            }, deleteMs);
            return () => window.clearTimeout(timeout);
        }

        setPhraseIndex((index) => (index + 1) % phrases.length);
        setPhase("typing");
    }, [deleteMs, disabled, holdMs, paused, phase, phraseIndex, phrases, text, typeMs]);

    return {
        display: text,
        fullCurrent: phrases[phraseIndex] ?? "",
    };
}