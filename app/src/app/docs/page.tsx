import fs from "fs";
import path from "path";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import rehypeSlug from "rehype-slug";
import rehypeAutolinkHeadings from "rehype-autolink-headings";
import Navigation from "@/components/marketing/Navigation";
import Footer from "@/components/marketing/Footer";

type TocItem = {
    id: string;
    title: string;
};

const quickLinks = [
    { href: "#at-a-glance", label: "At a glance" },
    { href: "#recipes", label: "Recipes" },
    { href: "#troubleshooting", label: "Troubleshooting" },
];

const surfaceCards = [
    {
        id: "sdk",
        label: "SDK",
        install: "npm i @scrolls/sdk",
        description: "Typed Node client for create, submit, decrypt, and export flows.",
    },
    {
        id: "cli",
        label: "CLI",
        install: "npm i -g @scrolls/cli",
        description: "Shell-first publishing and automation from YAML or JSON specs.",
    },
    {
        id: "mcp",
        label: "MCP",
        install: "npm i -g @scrolls/mcp",
        description: "Agent-facing tools for Claude, Cursor, and any MCP client.",
    },
];

function stripMarkdownLinks(value: string) {
    return value.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").replace(/`/g, "").trim();
}

function slugify(value: string) {
    return value
        .toLowerCase()
        .replace(/`/g, "")
        .replace(/[^a-z0-9\s-]/g, "")
        .trim()
        .replace(/\s+/g, "-");
}

function getSectionId(title: string) {
    if (title.startsWith("SDK -")) return "sdk";
    if (title.startsWith("CLI -")) return "cli";
    if (title.startsWith("MCP -")) return "mcp";
    return slugify(title);
}

function getToc(markdown: string): TocItem[] {
    return Array.from(markdown.matchAll(/^##\s+(.+)$/gm))
        .map((match) => stripMarkdownLinks(match[1]))
        .filter((title) => title !== "Contents")
        .map((title) => ({ id: getSectionId(title), title }));
}

export const metadata = {
    title: "Docs | Scrolls",
    description: "Programmatic guide for Scrolls forms",
};

export default function DocsPage() {
    const docsPath = path.join(process.cwd(), "..", "docs", "PROGRAMMATIC.md");
    let content = "";
    try {
        content = fs.readFileSync(docsPath, "utf8");
    } catch (e) {
        console.error("Could not read docs file", e);
        content = "# Docs not found\n\nPlease ensure `docs/PROGRAMMATIC.md` exists.";
    }

    const titleMatch = content.match(/^#\s+(.+)$/m);
    const title = titleMatch?.[1]?.trim() ?? "Programmatic Scrolls";
    const body = content.replace(/^#\s+.+\n+/, "");
    const introParagraph = stripMarkdownLinks(body.split(/\n{2,}/)[0] ?? "");
    const toc = getToc(body);

    return (
        <div className="flex min-h-screen flex-col bg-[color:var(--background-app)]">
            <Navigation />

            <main className="flex-1 px-6 pb-24 pt-28 lg:px-12">
                <div className="mx-auto max-w-7xl">
                    <section className="relative overflow-hidden rounded-[2rem] border border-white/[0.08] bg-white/[0.02] p-8 shadow-[0_32px_120px_-48px_rgba(0,0,0,0.9)] lg:p-10">
                        <div className="pointer-events-none absolute left-0 top-0 h-56 w-56 rounded-full bg-[color:var(--brand-primary-soft)] blur-3xl" />
                        <div className="pointer-events-none absolute right-0 top-0 h-48 w-48 rounded-full bg-[color:var(--brand-secondary-soft)] blur-3xl" />

                        <div className="relative grid gap-10 xl:grid-cols-[minmax(0,1.35fr)_minmax(280px,0.65fr)]">
                            <div>
                                <p className="font-mono text-xs uppercase tracking-[0.22em] text-[color:var(--text-tertiary)]">
                                    Programmatic guide
                                </p>
                                <h1 className="mt-4 font-display text-4xl font-medium tracking-tight text-[color:var(--text-primary)] sm:text-5xl lg:text-6xl">
                                    {title}
                                </h1>
                                <p className="mt-6 max-w-2xl text-base leading-relaxed text-[color:var(--text-secondary)] sm:text-lg">
                                    {introParagraph}
                                </p>

                                <div className="mt-8 flex flex-wrap gap-3">
                                    {quickLinks.map((link) => (
                                        <a
                                            key={link.href}
                                            href={link.href}
                                            className="rounded-full border border-white/[0.1] px-4 py-2 text-sm text-[color:var(--text-primary)] transition-colors hover:bg-white/[0.04]"
                                        >
                                            {link.label}
                                        </a>
                                    ))}
                                </div>
                            </div>

                            <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
                                {surfaceCards.map((card) => (
                                    <a
                                        key={card.id}
                                        href={`#${card.id}`}
                                        className="rounded-2xl border border-white/[0.08] bg-black/20 p-4 transition-colors hover:border-white/[0.14] hover:bg-white/[0.03]"
                                    >
                                        <div className="flex items-center justify-between gap-4">
                                            <span className="font-display text-lg text-[color:var(--text-primary)]">
                                                {card.label}
                                            </span>
                                            <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-[color:var(--text-tertiary)]">
                                                Surface
                                            </span>
                                        </div>
                                        <p className="mt-3 text-sm leading-relaxed text-[color:var(--text-secondary)]">
                                            {card.description}
                                        </p>
                                        <p className="mt-4 font-mono text-[12px] text-[#a78bfa]">
                                            {card.install}
                                        </p>
                                    </a>
                                ))}
                            </div>
                        </div>
                    </section>

                    <div className="mt-8 flex gap-3 overflow-x-auto pb-2 xl:hidden">
                        {toc.map((item) => (
                            <a
                                key={item.id}
                                href={`#${item.id}`}
                                className="whitespace-nowrap rounded-full border border-white/[0.08] px-3 py-2 text-sm text-[color:var(--text-secondary)] transition-colors hover:border-white/[0.14] hover:text-[color:var(--text-primary)]"
                            >
                                {item.title}
                            </a>
                        ))}
                    </div>

                    <div className="mt-16 grid gap-12 xl:grid-cols-[260px_minmax(0,1fr)]">
                        <aside className="hidden xl:block">
                            <div className="sticky top-28 space-y-4">
                                <div className="rounded-3xl border border-white/[0.08] bg-white/[0.02] p-6">
                                    <p className="font-mono text-xs uppercase tracking-[0.18em] text-[color:var(--text-tertiary)]">
                                        On this page
                                    </p>
                                    <nav className="mt-4 space-y-2">
                                        {toc.map((item) => (
                                            <a
                                                key={item.id}
                                                href={`#${item.id}`}
                                                className="block rounded-xl px-3 py-2 text-sm leading-relaxed text-[color:var(--text-secondary)] transition-colors hover:bg-white/[0.03] hover:text-[color:var(--text-primary)]"
                                            >
                                                {item.title}
                                            </a>
                                        ))}
                                    </nav>
                                </div>
                                <p className="px-1 text-xs leading-relaxed text-[color:var(--text-tertiary)]">
                                    Start with the quick scan, then jump to the surface you need. Use
                                    Recipes and Troubleshooting as the second pass.
                                </p>
                            </div>
                        </aside>

                        <article className="tiptap-content min-w-0 text-[color:var(--text-secondary)]">
                            <ReactMarkdown
                                remarkPlugins={[remarkGfm]}
                                rehypePlugins={[
                                    rehypeRaw,
                                    rehypeSlug,
                                    [rehypeAutolinkHeadings, { behavior: "wrap" }],
                                ]}
                                components={{
                                    h1: ({ node, ...props }) => (
                                        <h1
                                            className="scroll-mt-28 font-display text-4xl font-medium tracking-tight text-[color:var(--text-primary)] sm:text-5xl"
                                            {...props}
                                        />
                                    ),
                                    h2: ({ node, ...props }) => (
                                        <h2
                                            className="scroll-mt-28 border-b border-white/[0.06] pb-4 font-display text-2xl font-medium tracking-tight text-[color:var(--text-primary)] sm:text-3xl"
                                            {...props}
                                        />
                                    ),
                                    h3: ({ node, ...props }) => (
                                        <h3
                                            className="scroll-mt-28 font-display text-xl font-medium tracking-tight text-[color:var(--text-primary)] sm:text-2xl"
                                            {...props}
                                        />
                                    ),
                                    p: ({ node, ...props }) => (
                                        <p className="mb-6 leading-relaxed" {...props} />
                                    ),
                                    a: ({ href, children, ...props }) => {
                                        if (!href) {
                                            return <a {...props}>{children}</a>;
                                        }

                                        const isInternal = href.startsWith("#") || href.startsWith("/");

                                        return (
                                            <a
                                                href={href}
                                                target={isInternal ? undefined : "_blank"}
                                                rel={isInternal ? undefined : "noreferrer"}
                                                className="text-[#a78bfa] transition-colors hover:text-[#c4b5fd] hover:underline"
                                                {...props}
                                            >
                                                {children}
                                            </a>
                                        );
                                    },
                                    ul: ({ node, ...props }) => (
                                        <ul className="mb-6 list-disc space-y-2 pl-6" {...props} />
                                    ),
                                    ol: ({ node, ...props }) => (
                                        <ol className="mb-6 list-decimal space-y-2 pl-6" {...props} />
                                    ),
                                    li: ({ node, ...props }) => <li className="leading-relaxed" {...props} />,
                                    blockquote: ({ node, ...props }) => (
                                        <blockquote
                                            className="my-8 rounded-r-2xl border-l-2 border-[#a78bfa] bg-white/[0.02] px-5 py-4 text-[color:var(--text-primary)]"
                                            {...props}
                                        />
                                    ),
                                    table: ({ children }) => (
                                        <div className="my-8 overflow-x-auto rounded-2xl border border-white/[0.08] bg-white/[0.02]">
                                            <table className="min-w-full border-collapse text-sm">
                                                {children}
                                            </table>
                                        </div>
                                    ),
                                    thead: ({ node, ...props }) => (
                                        <thead className="bg-white/[0.04] text-[color:var(--text-primary)]" {...props} />
                                    ),
                                    th: ({ node, ...props }) => (
                                        <th
                                            className="border-b border-white/[0.08] px-4 py-3 text-left font-medium"
                                            {...props}
                                        />
                                    ),
                                    td: ({ node, ...props }) => (
                                        <td className="border-t border-white/[0.06] px-4 py-3 align-top" {...props} />
                                    ),
                                    pre: ({ node, ...props }) => (
                                        <pre
                                            className="my-8 overflow-x-auto rounded-2xl border border-white/[0.08] bg-[#080808] p-5 font-mono text-[13px] leading-[1.8] text-white/85"
                                            {...props}
                                        />
                                    ),
                                    code: ({ className, children, ...props }) => {
                                        if (className) {
                                            return (
                                                <code className={className} {...props}>
                                                    {children}
                                                </code>
                                            );
                                        }

                                        return (
                                            <code
                                                className="rounded bg-white/[0.06] px-1.5 py-0.5 font-mono text-[13px] text-[color:var(--text-primary)]"
                                                {...props}
                                            >
                                                {children}
                                            </code>
                                        );
                                    },
                                    strong: ({ node, ...props }) => (
                                        <strong className="font-medium text-[color:var(--text-primary)]" {...props} />
                                    ),
                                    hr: ({ node, ...props }) => (
                                        <hr className="my-16 border-white/[0.06]" {...props} />
                                    ),
                                    img: ({ src, alt }) => {
                                        if (!src) return null;

                                        return (
                                            <figure className="my-10 overflow-hidden rounded-[1.75rem] border border-white/[0.08] bg-white/[0.02] p-3">
                                                <img src={src} alt={alt ?? ""} className="w-full rounded-[1.25rem] object-cover" />
                                                {alt ? (
                                                    <figcaption className="px-2 pt-3 text-sm text-[color:var(--text-tertiary)]">
                                                        {alt}
                                                    </figcaption>
                                                ) : null}
                                            </figure>
                                        );
                                    },
                                }}
                            >
                                {body}
                            </ReactMarkdown>
                        </article>
                    </div>
                </div>
            </main>

            <Footer />
        </div>
    );
}
