"use client";

/**
 * Subtle dot grid background. Use as `<DotGrid />` inside a `relative` parent.
 * The grid fades out at the edges via radial mask for premium feel.
 */
export default function DotGrid({ className = "" }: { className?: string }) {
    return (
        <div
            className={`absolute inset-0 pointer-events-none ${className}`}
            aria-hidden="true"
            style={{
                backgroundImage:
                    "radial-gradient(circle, var(--dot-grid-color) 1px, transparent 1px)",
                backgroundSize: "24px 24px",
                maskImage:
                    "radial-gradient(ellipse 80% 80% at 50% 50%, black 30%, transparent 80%)",
                WebkitMaskImage:
                    "radial-gradient(ellipse 80% 80% at 50% 50%, black 30%, transparent 80%)",
            }}
        />
    );
}
