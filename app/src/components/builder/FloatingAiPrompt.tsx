"use client";

import { useGlobalDrop } from "@/lib/useGlobalDrop";
import { useState, useRef, useEffect, useCallback } from "react";
import { Icon } from "@iconify/react";
import { Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import clsx from "clsx";
import { validateAttachments } from "@/lib/ai-attachments";
import { createLiveTranscriber, isLiveTranscriptionSupported, type LiveTranscriber } from "@/lib/liveTranscription";
import { useTypewriter, pickRecordingMimeType, stopAudioCapture } from "@/lib/prompt-helpers";

const AI_EXAMPLES = [
    "Add a question about dietary restrictions...",
    "Translate this form into Spanish...",
    "Make this form shorter and more casual...",
    "Add a file upload for their resume...",
];

const TRANSCRIBE_PROXY_URL = process.env.NEXT_PUBLIC_CLAUDE_PROXY_URL
    ? new URL("/transcribe", process.env.NEXT_PUBLIC_CLAUDE_PROXY_URL).toString()
    : "";

interface FloatingAiPromptProps {
    aiStatus: "idle" | "generating" | "ready" | "error";
    aiError: string | null;
    initialPrompt: string;
    onGenerate: (prompt: string, attachments: File[]) => void;
}

export default function FloatingAiPrompt({
    aiStatus,
    aiError,
    initialPrompt,
    onGenerate,
}: FloatingAiPromptProps) {
    const isGenerating = aiStatus === "generating";
    const [prompt, setPrompt] = useState(initialPrompt);
    const [attachments, setAttachments] = useState<File[]>([]);

    const isDropTarget = useGlobalDrop(handleFiles);
    const [voiceState, setVoiceState] = useState<"idle" | "recording" | "transcribing">("idle");
    const [voiceError, setVoiceError] = useState<string | null>(null);
    const [submitError, setSubmitError] = useState<string | null>(aiError);

    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const mediaStreamRef = useRef<MediaStream | null>(null);
    const audioChunksRef = useRef<Blob[]>([]);
    const liveTranscriberRef = useRef<LiveTranscriber | null>(null);
    const promptBaselineRef = useRef<string>("");
    const liveSegmentRef = useRef<string>("");

    const animatedPlaceholder = useTypewriter(AI_EXAMPLES, {
        paused: prompt.length > 0,
        disabled: false,
    });

    useEffect(() => {
        setSubmitError(aiError);
    }, [aiError]);

    // Auto-resize
    useEffect(() => {
        const el = textareaRef.current;
        if (!el) return;
        el.style.height = "auto";
        el.style.height = `${Math.min(200, Math.max(52, el.scrollHeight))}px`;
    }, [prompt, attachments.length]);

    useEffect(() => {
        return () => {
            stopAudioCapture(mediaRecorderRef, mediaStreamRef);
            liveTranscriberRef.current?.abort();
            liveTranscriberRef.current = null;
        };
    }, []);

    function pushLivePrompt(segment: string) {
        liveSegmentRef.current = segment;
        const baseline = promptBaselineRef.current.trim();
        if (!segment) {
            setPrompt(baseline);
            return;
        }
        setPrompt(baseline ? `${baseline}\n${segment}` : segment);
    }

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
            const extension = mimeType.includes("mp4") || mimeType.includes("m4a") ? "m4a" : mimeType.includes("ogg") ? "ogg" : "webm";
            const formData = new FormData();
            formData.set("file", new File([audioBlob], `scrolls-voice-note.${extension}`, { type: mimeType }));

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

            commitFinalPrompt(transcript);
            setVoiceState("idle");
            textareaRef.current?.focus();
        } catch (error) {
            setVoiceState("idle");
            setVoiceError(error instanceof Error ? error.message : "Could not transcribe audio.");
        }
    }

    async function handleVoiceInput(e: React.MouseEvent) {
        e.preventDefault();
        e.stopPropagation();

        if (voiceState === "transcribing") return;

        if (voiceState === "recording") {
            liveTranscriberRef.current?.stop();
            liveTranscriberRef.current = null;
            mediaRecorderRef.current?.stop();
            return;
        }

        if (!TRANSCRIBE_PROXY_URL) {
            setVoiceError("Set the AI proxy URL to enable Whisper voice input.");
            return;
        }

        if (typeof window === "undefined" || typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia) {
            setVoiceError("This browser cannot record audio.");
            return;
        }

        try {
            setVoiceError(null);
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const mimeType = pickRecordingMimeType();
            const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);

            mediaStreamRef.current = stream;
            mediaRecorderRef.current = recorder;
            audioChunksRef.current = [];
            promptBaselineRef.current = prompt;
            liveSegmentRef.current = "";

            if (isLiveTranscriptionSupported()) {
                const transcriber = createLiveTranscriber({
                    onTranscript: (text) => pushLivePrompt(text),
                    onError: (err) => {
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
            setVoiceError(error instanceof Error && /denied|permission/i.test(error.message) ? "Microphone access was denied." : "Could not start the microphone.");
        }
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
            return next;
        });
    }

    function removeAttachment(index: number) {
        setAttachments((prev) => prev.filter((_, i) => i !== index));
    }

    const handleSubmit = useCallback((e?: React.FormEvent) => {
        if (e) e.preventDefault();
        setSubmitError(null);
        setVoiceError(null);

        const finalPrompt = prompt.trim() || animatedPlaceholder.fullCurrent;
        if (!finalPrompt || isGenerating || voiceState !== "idle") return;

        if (attachments.length > 0) {
            const validationError = validateAttachments(attachments);
            if (validationError) {
                setSubmitError(validationError);
                return;
            }
        }

        onGenerate(finalPrompt, attachments);
    }, [prompt, animatedPlaceholder.fullCurrent, isGenerating, voiceState, attachments, onGenerate]);

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === "Tab" && !e.shiftKey && !prompt.trim()) {
            e.preventDefault();
            setPrompt(animatedPlaceholder.fullCurrent);
            return;
        }
        // Enter submits, Shift+Enter inserts a newline.
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSubmit();
        }
    };

    return (
        <>

            {isDropTarget && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[color:var(--background-app)]/80 backdrop-blur-sm transition-all duration-300">
                    <div className="pointer-events-none rounded-3xl border-2 border-dashed border-[color:var(--brand-primary)] bg-[color:var(--brand-primary-soft)]/20 p-12 text-center shadow-2xl">
                        <Icon icon="fluent:document-arrow-up-24-filled" className="mx-auto mb-4 h-12 w-12 text-[color:var(--brand-primary)] animate-bounce" />
                        <h2 className="text-2xl font-semibold text-[color:var(--text-primary)]">Drop to attach to prompt</h2>
                        <p className="mt-2 text-[color:var(--text-secondary)]">Images, documents, PDFs</p>
                    </div>
                </div>
            )}
            <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 16 }}
                transition={{ duration: 0.25, ease: [0.25, 0.4, 0.25, 1] }}
                className="w-full max-w-2xl mx-auto pointer-events-auto"
            >
                <form onSubmit={handleSubmit} className="relative shadow-[var(--shadow-panel)] rounded-[24px] bg-[color:var(--surface-raised)] border border-[color:var(--border-default)] backdrop-blur-xl transition-[border-color,box-shadow] duration-200 focus-within:border-[color:var(--brand-primary-soft)]">

                    {isGenerating && (
                        <motion.div
                            layoutId="generating-glow"
                            className="absolute -inset-[1px] -z-10 rounded-[25px] border border-[#a78bfa]/35 shadow-[0_0_0_1px_rgba(167,139,250,0.12),0_18px_40px_-28px_rgba(167,139,250,0.55)]"
                            animate={{ opacity: [0.6, 1, 0.6] }}
                            transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
                        />
                    )}

                    <div className="relative flex flex-col pt-3 px-4 pb-3">

                        {/* Attachments preview */}
                        <AnimatePresence>
                            {attachments.length > 0 && (
                                <motion.div
                                    initial={{ opacity: 0, height: 0, marginBottom: 0 }}
                                    animate={{ opacity: 1, height: "auto", marginBottom: 12 }}
                                    exit={{ opacity: 0, height: 0, marginBottom: 0 }}
                                    transition={{ duration: 0.2, ease: [0.25, 0.4, 0.25, 1] }}
                                    className="flex flex-wrap gap-2 overflow-hidden px-1"
                                >
                                    {attachments.map((file, i) => (
                                        <div
                                            key={`${file.name}-${i}`}
                                            className="relative flex items-center gap-2 rounded-md bg-[color:var(--surface-muted)] px-2.5 py-1.5 border border-[color:var(--border-default)] group"
                                        >
                                            <Icon
                                                icon={file.type.startsWith("image/") ? "fluent:image-16-regular" : "fluent:document-16-regular"}
                                                className="w-4 h-4 text-[color:var(--text-secondary)]"
                                            />
                                            <span className="max-w-[120px] truncate text-xs text-[color:var(--text-primary)]">
                                                {file.name}
                                            </span>
                                            <button
                                                type="button"
                                                onClick={() => removeAttachment(i)}
                                                className="ml-1 opacity-0 group-hover:opacity-100 flex items-center justify-center w-4 h-4 rounded-full hover:bg-[color:var(--surface-muted)] transition-all"
                                            >
                                                <Icon icon="fluent:dismiss-12-regular" className="w-3 h-3 text-[color:var(--text-secondary)]" />
                                            </button>
                                        </div>
                                    ))}
                                </motion.div>
                            )}
                        </AnimatePresence>

                        {/* Main Input Row */}
                        <div className="flex items-end gap-3 w-full">
                            <div className="flex-1 relative">
                                {prompt.length === 0 && !isGenerating && (
                                    <div className="absolute top-[3px] left-1 pointer-events-none flex items-center text-[color:var(--text-muted)]">
                                        <span className="text-sm font-medium tracking-wide">
                                            {animatedPlaceholder.text}
                                        </span>
                                        <motion.span
                                            animate={{ opacity: [1, 0, 1] }}
                                            transition={{ duration: 0.8, repeat: Infinity, ease: "linear" }}
                                            className="ml-[1px] w-[2px] h-4 bg-[#a78bfa]"
                                        />
                                    </div>
                                )}

                                <textarea
                                    ref={textareaRef}
                                    value={prompt}
                                    onChange={(e) => setPrompt(e.target.value)}
                                    onKeyDown={handleKeyDown}
                                    disabled={isGenerating}
                                    rows={1}
                                    className={clsx(
                                        "w-full resize-none bg-transparent py-1 px-1",
                                        "text-sm text-[color:var(--text-primary)] placeholder:text-transparent",
                                        "focus:outline-none focus:ring-0 disabled:opacity-50",
                                        "m-0 block leading-relaxed"
                                    )}
                                    placeholder="hidden"
                                />
                            </div>

                            {/* Action buttons */}
                            <div className="flex items-center gap-1.5 shrink-0 self-end pb-0.5">
                                <input
                                    type="file"
                                    ref={fileInputRef}
                                    className="hidden"
                                    multiple
                                    accept=".pdf,.doc,.docx,.txt,.md,image/*,audio/*,video/*"
                                    onChange={(e) => handleFiles(e.target.files)}
                                />

                                <button
                                    type="button"
                                    onClick={() => fileInputRef.current?.click()}
                                    disabled={isGenerating || voiceState !== "idle"}
                                    className="w-8 h-8 flex items-center justify-center rounded-full text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)] hover:bg-[color:var(--background-subtle)] transition-all disabled:opacity-50"
                                >
                                    <Icon icon="fluent:attach-16-regular" className="w-[18px] h-[18px]" />
                                </button>

                                <button
                                    type="button"
                                    onClick={handleVoiceInput}
                                    disabled={isGenerating}
                                    className={clsx(
                                        "w-8 h-8 flex items-center justify-center rounded-full transition-all group duration-200",
                                        voiceState === "recording"
                                            ? "bg-red-500/10 text-red-400 hover:bg-red-500/20"
                                            : voiceState === "transcribing"
                                                ? "bg-[color:var(--surface-muted)] text-[color:var(--text-secondary)]"
                                                : "text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)] hover:bg-[color:var(--background-subtle)]"
                                    )}
                                >
                                    {voiceState === "transcribing" ? (
                                        <Loader2 className="w-[18px] h-[18px] animate-spin opacity-50" />
                                    ) : (
                                        <Icon
                                            icon={voiceState === "recording" ? "fluent:record-stop-16-regular" : "fluent:mic-16-regular"}
                                            className={clsx(
                                                "w-[18px] h-[18px]",
                                                voiceState === "recording" && "animate-pulse"
                                            )}
                                        />
                                    )}
                                </button>

                                <div className="w-px h-6 bg-[color:var(--border-strong)] mx-0.5" />

                                <button
                                    type="button"
                                    onClick={handleSubmit}
                                    disabled={isGenerating || voiceState !== "idle" || (!prompt.trim() && attachments.length === 0)}
                                    className={clsx(
                                        "w-8 h-8 flex items-center justify-center rounded-full transition-all duration-200",
                                        isGenerating
                                            ? "bg-[color:var(--brand-primary)] text-white shadow-[0_0_12px_rgba(167,139,250,0.4)]"
                                            : "bg-[color:var(--text-primary)] text-[color:var(--text-inverse)] hover:opacity-90 hover:scale-[1.02]"
                                    )}
                                >
                                    {isGenerating ? (
                                        <Icon icon="fluent:sparkle-16-filled" className="w-[18px] h-[18px] animate-pulse" />
                                    ) : (
                                        <Icon icon="fluent:arrow-up-16-filled" className="w-[18px] h-[18px]" />
                                    )}
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Errors */}
                    {(submitError || voiceError) && (
                        <div className="absolute top-full left-0 right-0 pt-2 flex items-center gap-2 text-xs text-red-400 justify-center">
                            <Icon icon="fluent:error-circle-16-regular" />
                            <span>{submitError || voiceError}</span>
                        </div>
                    )}
                </form>
            </motion.div>
        </>
    );
}
