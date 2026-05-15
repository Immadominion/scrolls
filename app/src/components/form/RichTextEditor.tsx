"use client";

// ─────────────────────────────────────────────────────────────────────
// RichTextEditor — TipTap v3 + StarterKit, wired into the public form
// renderer for fields of type `rich_text`.
//
// Stores HTML as a string. SSR-safe via `immediatelyRender: false`
// (Next.js 16 + static export). Output is sanitized on the responses
// side via `sanitizeRichText` before it ever hits an admin's DOM.
// ─────────────────────────────────────────────────────────────────────

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import { useEffect } from "react";
import clsx from "clsx";
import {
    Bold,
    Italic,
    Strikethrough,
    Code,
    List,
    ListOrdered,
    Quote,
    Heading2,
    Heading3,
    Undo2,
    Redo2,
} from "lucide-react";

interface RichTextEditorProps {
    value: string;
    onChange: (html: string) => void;
    placeholder?: string;
    required?: boolean;
}

export default function RichTextEditor({
    value,
    onChange,
    placeholder,
    required,
}: RichTextEditorProps) {
    const editor = useEditor({
        // Disable SSR rendering — editor mounts on the client only.
        // (Required for Next.js to avoid hydration mismatches.)
        immediatelyRender: false,
        extensions: [
            StarterKit.configure({
                heading: { levels: [2, 3] },
            }),
            Placeholder.configure({
                placeholder: placeholder ?? "Your answer…",
                emptyEditorClass: "is-editor-empty",
            }),
        ],
        content: value || "",
        editorProps: {
            attributes: {
                class: clsx(
                    "tiptap-content prose prose-invert prose-sm max-w-none",
                    "min-h-[8rem] px-4 py-3 outline-none",
                    "text-sm text-white",
                ),
                "aria-required": required ? "true" : "false",
            },
        },
        onUpdate: ({ editor: e }) => {
            const html = e.getHTML();
            // TipTap emits <p></p> for empty content; normalize to "".
            const isEmpty = e.isEmpty;
            onChange(isEmpty ? "" : html);
        },
    });

    // Keep editor in sync if parent resets the value (e.g. form reset).
    useEffect(() => {
        if (!editor) return;
        const current = editor.getHTML();
        if ((value || "") !== current && (value || "") !== "") {
            editor.commands.setContent(value || "", { emitUpdate: false });
        } else if (!value && !editor.isEmpty) {
            editor.commands.clearContent(false);
        }
    }, [value, editor]);

    if (!editor) {
        return (
            <div className="w-full min-h-[10rem] bg-[#111111] border border-[#222222] rounded-xl animate-pulse" />
        );
    }

    const btn = (active: boolean) =>
        clsx(
            "p-1.5 rounded-md transition-colors",
            active
                ? "bg-[#a78bfa]/15 text-[#a78bfa]"
                : "text-[#71717a] hover:text-white hover:bg-[#1a1a1a]",
        );

    return (
        <div className="w-full bg-[#111111] border border-[#222222] rounded-xl overflow-hidden focus-within:border-[#a78bfa]/50 transition-colors">
            <div className="flex flex-wrap items-center gap-0.5 px-2 py-1.5 border-b border-[#1a1a1a] bg-[#0d0d0d]">
                <button
                    type="button"
                    onClick={() => editor.chain().focus().toggleBold().run()}
                    className={btn(editor.isActive("bold"))}
                    aria-label="Bold"
                    title="Bold (⌘B)"
                >
                    <Bold size={14} />
                </button>
                <button
                    type="button"
                    onClick={() => editor.chain().focus().toggleItalic().run()}
                    className={btn(editor.isActive("italic"))}
                    aria-label="Italic"
                    title="Italic (⌘I)"
                >
                    <Italic size={14} />
                </button>
                <button
                    type="button"
                    onClick={() => editor.chain().focus().toggleStrike().run()}
                    className={btn(editor.isActive("strike"))}
                    aria-label="Strikethrough"
                    title="Strikethrough"
                >
                    <Strikethrough size={14} />
                </button>
                <button
                    type="button"
                    onClick={() => editor.chain().focus().toggleCode().run()}
                    className={btn(editor.isActive("code"))}
                    aria-label="Inline code"
                    title="Inline code"
                >
                    <Code size={14} />
                </button>
                <span className="w-px h-4 bg-[#222222] mx-1" />
                <button
                    type="button"
                    onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
                    className={btn(editor.isActive("heading", { level: 2 }))}
                    aria-label="Heading 2"
                    title="Heading 2"
                >
                    <Heading2 size={14} />
                </button>
                <button
                    type="button"
                    onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
                    className={btn(editor.isActive("heading", { level: 3 }))}
                    aria-label="Heading 3"
                    title="Heading 3"
                >
                    <Heading3 size={14} />
                </button>
                <span className="w-px h-4 bg-[#222222] mx-1" />
                <button
                    type="button"
                    onClick={() => editor.chain().focus().toggleBulletList().run()}
                    className={btn(editor.isActive("bulletList"))}
                    aria-label="Bullet list"
                    title="Bullet list"
                >
                    <List size={14} />
                </button>
                <button
                    type="button"
                    onClick={() => editor.chain().focus().toggleOrderedList().run()}
                    className={btn(editor.isActive("orderedList"))}
                    aria-label="Ordered list"
                    title="Ordered list"
                >
                    <ListOrdered size={14} />
                </button>
                <button
                    type="button"
                    onClick={() => editor.chain().focus().toggleBlockquote().run()}
                    className={btn(editor.isActive("blockquote"))}
                    aria-label="Quote"
                    title="Quote"
                >
                    <Quote size={14} />
                </button>
                <span className="ml-auto flex items-center gap-0.5">
                    <button
                        type="button"
                        onClick={() => editor.chain().focus().undo().run()}
                        disabled={!editor.can().undo()}
                        className={clsx(btn(false), "disabled:opacity-30 disabled:cursor-not-allowed")}
                        aria-label="Undo"
                        title="Undo (⌘Z)"
                    >
                        <Undo2 size={14} />
                    </button>
                    <button
                        type="button"
                        onClick={() => editor.chain().focus().redo().run()}
                        disabled={!editor.can().redo()}
                        className={clsx(btn(false), "disabled:opacity-30 disabled:cursor-not-allowed")}
                        aria-label="Redo"
                        title="Redo (⌘⇧Z)"
                    >
                        <Redo2 size={14} />
                    </button>
                </span>
            </div>
            <EditorContent editor={editor} />
        </div>
    );
}
