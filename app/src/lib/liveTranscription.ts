// ─────────────────────────────────────────────────────────────────────
// Live transcription via the browser-native Web Speech API.
//
// Emits live partial transcripts WHILE the user speaks so the prompt
// textarea updates in real time. Whisper still runs on stop for the
// accurate, punctuated final pass — the live partials are replaced
// with Whisper's output once it returns.
//
// This uses the Web Speech Recognition API (SpeechRecognition /
// webkitSpeechRecognition) and degrades gracefully on browsers that
// don't ship it (Firefox today). When unsupported, the caller should
// fall back to the existing Whisper-only flow.
// ─────────────────────────────────────────────────────────────────────

interface SpeechRecognitionAlternative {
    readonly transcript: string;
    readonly confidence: number;
}
interface SpeechRecognitionResult {
    readonly isFinal: boolean;
    readonly length: number;
    item(index: number): SpeechRecognitionAlternative;
    [index: number]: SpeechRecognitionAlternative;
}
interface SpeechRecognitionResultList {
    readonly length: number;
    item(index: number): SpeechRecognitionResult;
    [index: number]: SpeechRecognitionResult;
}
interface SpeechRecognitionEvent extends Event {
    readonly resultIndex: number;
    readonly results: SpeechRecognitionResultList;
}
interface SpeechRecognitionErrorEvent extends Event {
    readonly error: string;
    readonly message?: string;
}
interface SpeechRecognitionInstance extends EventTarget {
    continuous: boolean;
    interimResults: boolean;
    lang: string;
    maxAlternatives: number;
    start(): void;
    stop(): void;
    abort(): void;
    onresult: ((event: SpeechRecognitionEvent) => void) | null;
    onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
    onend: (() => void) | null;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionInstance;

function getCtor(): SpeechRecognitionCtor | null {
    if (typeof window === "undefined") return null;
    const w = window as unknown as {
        SpeechRecognition?: SpeechRecognitionCtor;
        webkitSpeechRecognition?: SpeechRecognitionCtor;
    };
    return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function isLiveTranscriptionSupported(): boolean {
    return getCtor() !== null;
}

export interface LiveTranscriber {
    /** Start streaming. Resolves on success; rejects on permission/start error. */
    start(): Promise<void>;
    /** Stop streaming. Idempotent. */
    stop(): void;
    /** Force-cancel without firing more events. */
    abort(): void;
}

export interface LiveTranscriberOptions {
    /** Called each time the rolling transcript changes (interim + final glued). */
    onTranscript: (text: string) => void;
    /** Called once per recognised final segment (punctuated). */
    onFinalSegment?: (segment: string) => void;
    /** Called on terminal errors. */
    onError?: (error: string) => void;
    /** BCP-47 language tag. Defaults to navigator.language || "en-US". */
    lang?: string;
}

/**
 * Create a live transcriber. Returns null if the browser does not
 * support the Web Speech API — caller should fall back to Whisper.
 */
export function createLiveTranscriber(
    options: LiveTranscriberOptions,
): LiveTranscriber | null {
    const Ctor = getCtor();
    if (!Ctor) return null;

    const recognizer = new Ctor();
    recognizer.continuous = true;
    recognizer.interimResults = true;
    recognizer.maxAlternatives = 1;
    recognizer.lang =
        options.lang ??
        (typeof navigator !== "undefined" ? navigator.language : null) ??
        "en-US";

    let stopped = false;
    let finalTranscript = "";

    recognizer.onresult = (event) => {
        let interim = "";
        for (let i = event.resultIndex; i < event.results.length; i += 1) {
            const result = event.results[i];
            const segment = result[0]?.transcript ?? "";
            if (result.isFinal) {
                const trimmed = segment.trim();
                if (trimmed) {
                    finalTranscript = finalTranscript
                        ? `${finalTranscript} ${trimmed}`
                        : trimmed;
                    options.onFinalSegment?.(trimmed);
                }
            } else {
                interim += segment;
            }
        }
        const combined = [finalTranscript, interim.trim()].filter(Boolean).join(" ");
        options.onTranscript(combined);
    };

    recognizer.onerror = (event) => {
        // "no-speech" and "aborted" are benign — don't surface them.
        if (event.error === "no-speech" || event.error === "aborted") return;
        options.onError?.(event.error || "speech-recognition-error");
    };

    recognizer.onend = () => {
        // Auto-restart if user hasn't stopped (some browsers cap session length).
        if (!stopped) {
            try {
                recognizer.start();
            } catch {
                /* race with explicit stop — ignore */
            }
        }
    };

    return {
        async start() {
            stopped = false;
            finalTranscript = "";
            try {
                recognizer.start();
            } catch (err) {
                throw err instanceof Error ? err : new Error("start-failed");
            }
        },
        stop() {
            stopped = true;
            try {
                recognizer.stop();
            } catch {
                /* not started yet */
            }
        },
        abort() {
            stopped = true;
            recognizer.onresult = null;
            recognizer.onerror = null;
            recognizer.onend = null;
            try {
                recognizer.abort();
            } catch {
                /* already aborted */
            }
        },
    };
}
