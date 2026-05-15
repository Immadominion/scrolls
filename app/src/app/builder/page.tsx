import { Suspense } from "react";
import BuilderLayout from "@/components/builder/BuilderLayout";

export const metadata = {
    title: "Form Builder — Scrolls",
    description: "Create your form. Every response stored forever on Walrus.",
};

export default function BuilderPage() {
    return (
        <Suspense fallback={<div className="min-h-screen bg-[#0a0a0a]" />}>
            <BuilderLayout />
        </Suspense>
    );
}
