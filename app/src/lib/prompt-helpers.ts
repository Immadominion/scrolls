import { useState, useEffect } from "react";

export function pickRecordingMimeType(): string | undefined {
    if (typeof MediaRecorder === "undefined") {
        return undefined;
    }

    return ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find((mimeType) =>
        MediaRecorder.isTypeSupported(mimeType),
    );
}

export function stopAudioCapture(
    mediaRecorderRef: { current: MediaRecorder | null },
    mediaStreamRef: { current: MediaStream | null },
) {
    mediaRecorderRef.current = null;
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    mediaStreamRef.current = null;
}

export interface TypewriterState {
    text: string;
    fullCurrent: string;
}

export function useTypewriter(
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

        const target = phrases[phraseIndex] ?? "";

        let timeout: ReturnType<typeof setTimeout>;

        if (phase === "typing") {
            if (text.length < target.length) {
                // Add character
                timeout = setTimeout(() => {
                    setText(target.slice(0, text.length + 1));
                }, typeMs * Math.max(0.5, Math.random()));
            } else {
                // Done typing phrase
                timeout = setTimeout(() => {
                    setPhase("deleting");
                }, holdMs);
            }
        } else {
            if (text.length > 0) {
                // Subtract character
                timeout = setTimeout(() => {
                    setText(target.slice(0, text.length - 1));
                }, deleteMs);
            } else {
                // Next phrase
                timeout = setTimeout(() => {
                    setPhraseIndex((prev) => (prev + 1) % phrases.length);
                    setPhase("typing");
                }, 100);
            }
        }

        return () => clearTimeout(timeout);
    }, [
        text,
        phase,
        phraseIndex,
        phrases,
        paused,
        disabled,
        typeMs,
        deleteMs,
        holdMs,
    ]);

    return { text, fullCurrent: phrases[phraseIndex] ?? "" };
}
