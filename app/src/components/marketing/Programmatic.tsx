"use client";

import { motion } from "framer-motion";
import { Icon } from "@iconify/react";

const ease = [0.25, 0.4, 0.25, 1] as const;

type Line = { kind: "prompt" | "comment" | "code" | "output" | "blank"; text?: string };

function CodeBlock({ title, lines }: { title: string; lines: Line[] }) {
    return (
        <div className="relative overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0c0c0c] shadow-2xl shadow-black/50">
            {/* Top glass highlight */}
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/15 to-transparent" />

            <div className="flex items-center justify-between border-b border-white/[0.06] bg-white/[0.02] px-4 py-2.5">
                <div className="flex items-center gap-2">
                    <div className="h-2.5 w-2.5 rounded-full bg-white/20 transition-colors hover:bg-red-500/80" />
                    <div className="h-2.5 w-2.5 rounded-full bg-white/20 transition-colors hover:bg-yellow-500/80" />
                    <div className="h-2.5 w-2.5 rounded-full bg-white/20 transition-colors hover:bg-green-500/80" />
                </div>
                <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-white/40">
                    {title}
                </span>
                <div className="w-10" />
            </div>
            <div className="overflow-x-auto px-5 py-5 font-mono text-[12px] leading-[1.75] sm:text-[13px]">
                {lines.map((line, idx) => {
                    if (line.kind === "blank") return <div key={idx}>&nbsp;</div>;
                    if (line.kind === "prompt")
                        return (
                            <div key={idx} className="whitespace-pre">
                                <span className="text-[#06b6d4]">$</span>{" "}
                                <span className="text-white/95">{line.text}</span>
                            </div>
                        );
                    if (line.kind === "output")
                        return (
                            <div key={idx} className="whitespace-pre text-white/50">
                                {line.text || "\u00a0"}
                            </div>
                        );
                    if (line.kind === "comment")
                        return (
                            <div key={idx} className="whitespace-pre text-white/30 italic">
                                {line.text}
                            </div>
                        );
                    return (
                        <div key={idx} className="whitespace-pre text-white/85">
                            {line.text || "\u00a0"}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

function Surface({
    index,
    label,
    name,
    headline,
    body,
    install,
    docsHref,
    reverse,
    code,
    bullets,
}: {
    index: string;
    label: string;
    name: string;
    headline: string;
    body: string;
    install: string;
    docsHref: string;
    reverse?: boolean;
    code: { title: string; lines: Line[] };
    bullets: string[];
}) {
    return (
        <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
            {/* Copy */}
            <motion.div
                initial={{ opacity: 0, y: 32 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-100px" }}
                transition={{ duration: 0.8, ease }}
                className={reverse ? "lg:order-2" : ""}
            >
                <div className="flex items-center gap-4">
                    <span className="font-mono text-xs font-semibold tracking-[0.2em] text-[#06b6d4]">
                        {index}
                    </span>
                    <div className="h-px w-8 bg-white/10" />
                    <span className="font-mono text-xs uppercase tracking-[0.2em] text-[color:var(--text-tertiary)]">
                        {label}
                    </span>
                </div>

                <h3 className="mt-5 font-display text-3xl font-medium tracking-tight text-[color:var(--text-primary)] sm:text-[2.5rem] lg:text-[2.8rem] lg:leading-[1.08]">
                    {name}
                    <br />
                    <span className="text-[color:var(--text-tertiary)]">{headline}</span>
                </h3>

                <p className="mt-5 max-w-md text-[15px] leading-relaxed text-[color:var(--text-secondary)] sm:text-base">
                    {body}
                </p>

                <div className="mt-6 inline-flex w-max max-w-full items-center gap-3 rounded-xl border border-white/5 bg-white/[0.02] px-3.5 py-2 font-mono text-[12px] shadow-sm backdrop-blur-md sm:text-[13px]">
                    <span className="text-[#06b6d4] opacity-70">$</span>
                    <span className="text-[color:var(--text-primary)]">{install}</span>
                    <button className="ml-2 flex items-center justify-center rounded bg-white/5 p-1.5 text-[color:var(--text-tertiary)] transition-colors hover:bg-white/10 hover:text-white" title="Copy to clipboard" onClick={() => navigator.clipboard.writeText(install)}>
                        <Icon icon="fluent:copy-16-regular" className="h-3.5 w-3.5" />
                    </button>
                </div>

                <ul className="mt-6 space-y-2.5">
                    {bullets.map((b) => (
                        <li
                            key={b}
                            className="flex items-start gap-3.5 text-sm leading-relaxed text-[color:var(--text-secondary)]"
                        >
                            <Icon icon="fluent:checkmark-circle-16-filled" className="mt-1 h-4 w-4 shrink-0 text-[#a78bfa] opacity-80" />
                            {b}
                        </li>
                    ))}
                </ul>

                <a
                    href={docsHref}
                    className="group mt-8 inline-flex items-center gap-2 rounded-full border border-white/10 bg-transparent px-4 py-2 text-sm font-medium text-[color:var(--text-primary)] transition-all hover:bg-white/5"
                >
                    Explore the {label.toLowerCase()} guide
                    <Icon
                        icon="fluent:arrow-right-20-regular"
                        className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
                    />
                </a>
            </motion.div>

            {/* Code */}
            <motion.div
                initial={{ opacity: 0, y: 32 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-100px" }}
                transition={{ duration: 0.8, ease, delay: 0.1 }}
                className={`relative ${reverse ? "lg:order-1" : ""}`}
            >
                {/* Glow effect behind the code block */}
                <div className="absolute -inset-4 z-0 rounded-full bg-[radial-gradient(circle_at_center,var(--brand-primary-soft)_0%,transparent_70%)] opacity-30 blur-2xl" />
                <div className="relative z-10">
                    <CodeBlock title={code.title} lines={code.lines} />
                </div>
            </motion.div>
        </div>
    );
}

const DOCS_BASE = "/docs";

export default function Programmatic() {
    return (
        <section id="programmatic" className="relative px-6 py-24 lg:px-12 lg:py-28">
            <div className="mx-auto max-w-6xl">
                <motion.div
                    initial={{ opacity: 0, y: 16 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, margin: "-100px" }}
                    transition={{ duration: 0.7, ease }}
                    className="mx-auto mb-16 max-w-3xl text-center lg:mb-20"
                >
                    <h2 className="font-display text-3xl font-medium tracking-tight text-[color:var(--text-primary)] sm:text-5xl lg:text-[4rem]">
                        Three surfaces.
                        <br />
                        <span className="text-[color:var(--text-tertiary)]">One source of truth.</span>
                    </h2>
                    <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-[color:var(--text-secondary)] sm:text-[17px]">
                        The web builder is for humans. The CLI is for your shell. The MCP server is for
                        your agent. Same forms, same dashboard, same Walrus blob — whichever surface you
                        pick.
                    </p>
                </motion.div>

                <div className="space-y-20 lg:space-y-24">
                    <Surface
                        index="01"
                        label="CLI"
                        name="scrolls"
                        headline="from your terminal."
                        body="Drop a YAML file, run one command, get a share link. The whole publishing flow becomes a shell script — perfect for CI, migrations, or just keeping your forms in git."
                        install="npm i -g @scrolls/cli"
                        docsHref={`${DOCS_BASE}#cli`}
                        bullets={[
                            "Seven subcommands: init, create, list, get, submissions, export, submit.",
                            "Private form? The CLI writes the decryption key next to your spec at chmod 600.",
                            "--json on every command. Pipe straight into jq.",
                        ]}
                        code={{
                            title: "bash",
                            lines: [
                                { kind: "prompt", text: "scrolls create bug-report.yaml" },
                                { kind: "blank" },
                                { kind: "output", text: "✦ scrolls · walrus-native forms" },
                                { kind: "output", text: "·  Reading spec bug-report.yaml" },
                                { kind: "output", text: "·  Uploading to Walrus (testnet)…" },
                                { kind: "blank" },
                                { kind: "output", text: "✓  Form published." },
                                { kind: "output", text: "   Form ID    0x4a…b29c" },
                                { kind: "output", text: "   Blob       _0QTBv…Mtrw" },
                                { kind: "output", text: "   Share      scrolls.fun/f?id=0x4a…b29c" },
                            ],
                        }}
                    />

                    <Surface
                        index="02"
                        label="SDK"
                        name="ScrollsClient"
                        headline="in your codebase."
                        body="A pure Node 20+ library, ESM-only, typed end-to-end. Same encryption envelope as the web app — ECDH P-256, HKDF-SHA256, AES-GCM-256 — so a private form created with the SDK reads cleanly in the dashboard, and vice versa."
                        install="npm i @scrolls/sdk"
                        docsHref={`${DOCS_BASE}#sdk`}
                        reverse
                        bullets={[
                            "createForm, getForm, listForms, submit, listSubmissions, exportCsv.",
                            "Blob-only mode works without a Sui key. On-chain mode adds enumeration.",
                            "No opaque error codes. Errors say what to fix.",
                        ]}
                        code={{
                            title: "typescript",
                            lines: [
                                { kind: "code", text: "import { ScrollsClient } from \"@scrolls/sdk\";" },
                                { kind: "blank" },
                                { kind: "code", text: "const scrolls = new ScrollsClient({" },
                                { kind: "code", text: "  network: \"testnet\"," },
                                { kind: "code", text: "  suiPrivateKey: process.env.SUI_KEY," },
                                { kind: "code", text: "});" },
                                { kind: "blank" },
                                { kind: "code", text: "const { shareUrl } = await scrolls.createForm({" },
                                { kind: "code", text: "  title: \"Bug report\"," },
                                { kind: "code", text: "  fields: [" },
                                { kind: "code", text: "    { type: \"short_text\", label: \"Title\" }," },
                                { kind: "code", text: "    { type: \"long_text\",  label: \"What happened?\" }," },
                                { kind: "code", text: "  ]," },
                                { kind: "code", text: "});" },
                            ],
                        }}
                    />

                    <Surface
                        index="03"
                        label="MCP"
                        name="scrolls-mcp"
                        headline="for your agent."
                        body="A Model Context Protocol server that exposes Scrolls as six tools. Drop it in Claude Desktop or Cursor and just ask: design a survey, publish it, summarise the responses when they arrive."
                        install="npm i -g @scrolls/mcp"
                        docsHref={`${DOCS_BASE}#mcp`}
                        bullets={[
                            "Six tools: create, list, get, list submissions, export, submit.",
                            "Stdio JSON-RPC. No network egress beyond Sui & Walrus.",
                            "Run without a Sui key for read-only or submit-only agents.",
                        ]}
                        code={{
                            title: "claude_desktop_config.json",
                            lines: [
                                { kind: "code", text: "{" },
                                { kind: "code", text: "  \"mcpServers\": {" },
                                { kind: "code", text: "    \"scrolls\": {" },
                                { kind: "code", text: "      \"command\": \"scrolls-mcp\"," },
                                { kind: "code", text: "      \"env\": {" },
                                { kind: "code", text: "        \"SCROLLS_NETWORK\": \"testnet\"," },
                                { kind: "code", text: "        \"SUI_PRIVATE_KEY\": \"suiprivkey1…\"" },
                                { kind: "code", text: "      }" },
                                { kind: "code", text: "    }" },
                                { kind: "code", text: "  }" },
                                { kind: "code", text: "}" },
                            ],
                        }}
                    />
                </div>

                <motion.div
                    initial={{ opacity: 0 }}
                    whileInView={{ opacity: 1 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.6, ease }}
                    className="mt-20 flex flex-col items-center gap-3 border-t border-[color:var(--border-subtle)] pt-12 text-center lg:mt-24"
                >
                    <p className="text-sm text-[color:var(--text-tertiary)]">
                        Full reference: API, recipes, CI snippets, troubleshooting.
                    </p>
                    <a
                        href={DOCS_BASE}
                        className="group inline-flex items-center gap-2 font-display text-base text-[color:var(--text-primary)] transition-colors hover:text-[#a78bfa]"
                    >
                        Read the programmatic guide
                        <Icon
                            icon="fluent:arrow-right-20-regular"
                            className="h-4 w-4 transition-transform group-hover:translate-x-1"
                        />
                    </a>
                </motion.div>
            </div>
        </section>
    );
}
