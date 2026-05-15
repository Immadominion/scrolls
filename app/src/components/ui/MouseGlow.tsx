"use client";

import { useEffect, useState, useRef } from "react";
import { motion, useSpring, useMotionValue } from "framer-motion";

interface MouseGlowProps {
    className?: string;
    intensity?: "subtle" | "medium";
}

/**
 * Ambient mouse-following glow. Adds depth and life to dark surfaces.
 * Two layers (fast violet + slow cyan) create a parallax feel.
 */
export default function MouseGlow({
    className = "",
    intensity = "subtle",
}: MouseGlowProps) {
    const [isClient, setIsClient] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    const mouseX = useMotionValue(0);
    const mouseY = useMotionValue(0);

    const smoothX = useSpring(mouseX, { damping: 25, stiffness: 150, mass: 0.5 });
    const smoothY = useSpring(mouseY, { damping: 25, stiffness: 150, mass: 0.5 });
    const smoothX2 = useSpring(mouseX, { damping: 40, stiffness: 90, mass: 1 });
    const smoothY2 = useSpring(mouseY, { damping: 40, stiffness: 90, mass: 1 });

    useEffect(() => {
        setIsClient(true);
        const handleMove = (e: MouseEvent) => {
            if (!containerRef.current) return;
            const rect = containerRef.current.getBoundingClientRect();
            mouseX.set(e.clientX - rect.left);
            mouseY.set(e.clientY - rect.top);
        };
        window.addEventListener("mousemove", handleMove);
        return () => window.removeEventListener("mousemove", handleMove);
    }, [mouseX, mouseY]);

    if (!isClient) return null;

    const opacity1 = intensity === "subtle" ? 0.05 : 0.08;
    const opacity2 = intensity === "subtle" ? 0.03 : 0.05;

    return (
        <div
            ref={containerRef}
            className={`absolute inset-0 overflow-hidden pointer-events-none ${className}`}
            aria-hidden="true"
        >
            <motion.div
                className="absolute w-[600px] h-[600px] rounded-full"
                style={{
                    opacity: opacity1,
                    x: smoothX,
                    y: smoothY,
                    translateX: "-50%",
                    translateY: "-50%",
                    background: "radial-gradient(circle, rgba(167, 139, 250, 0.7) 0%, rgba(167, 139, 250, 0) 70%)",
                    filter: "blur(60px)",
                }}
            />
            <motion.div
                className="absolute w-[800px] h-[800px] rounded-full"
                style={{
                    opacity: opacity2,
                    x: smoothX2,
                    y: smoothY2,
                    translateX: "-50%",
                    translateY: "-50%",
                    background: "radial-gradient(circle, rgba(6, 182, 212, 0.6) 0%, rgba(6, 182, 212, 0) 70%)",
                    filter: "blur(80px)",
                }}
            />
        </div>
    );
}
