// `scrolls submissions <formId>` — list submissions, decrypt if a key is provided.

import { readFile } from "node:fs/promises";
import { buildClient, type ClientFlags } from "../client-factory.js";
import { banner, fail, ok, info, dim, bold, kv, truncate, warn } from "../ui.js";

interface SubsOptions extends ClientFlags {
    key?: string;
    limit?: number;
    json?: boolean;
}

export async function runSubmissions(formId: string, opts: SubsOptions): Promise<void> {
    if (!opts.json) banner();
    const { client } = await buildClient(opts);

    const privateKeyJwk = await loadKeyFile(opts.key);

    let subs;
    try {
        subs = await client.listSubmissions(formId, {
            privateKeyJwk,
            limit: opts.limit,
        });
    } catch (err) {
        fail((err as Error).message);
    }

    if (opts.json) {
        process.stdout.write(JSON.stringify(subs, null, 2) + "\n");
        return;
    }

    if (!subs.length) {
        info("No submissions yet.");
        return;
    }

    ok(`${subs.length} submission${subs.length === 1 ? "" : "s"}`);
    if (subs.some((s) => s.wasEncrypted) && !privateKeyJwk) {
        console.log("");
        warn("Some submissions are encrypted. Pass --key <path.json> to decrypt.");
    }
    console.log("");
    for (const s of subs) {
        console.log(`  ${bold(s.submittedAt)} ${dim(s.wasEncrypted ? "(encrypted)" : "")}`);
        if (s.submitterAddress) kv("From", truncate(s.submitterAddress));
        if (s.responses.length === 0 && s.wasEncrypted) {
            kv("Body", dim("[encrypted — supply --key to decrypt]"));
        } else {
            for (const r of s.responses) {
                kv(r.fieldId, stringify(r.value));
            }
        }
        console.log(`  ${dim("─".repeat(40))}`);
    }
}

async function loadKeyFile(path?: string): Promise<JsonWebKey | undefined> {
    if (!path) return undefined;
    try {
        const raw = await readFile(path, "utf8");
        const parsed = JSON.parse(raw);
        if (parsed.privateKeyJwk) return parsed.privateKeyJwk as JsonWebKey;
        if (parsed.kty) return parsed as JsonWebKey;
        fail(`Key file ${path} has no privateKeyJwk.`);
    } catch (err) {
        fail(`Failed to read key file ${path}: ${(err as Error).message}`);
    }
}

function stringify(v: unknown): string {
    if (v === null || v === undefined) return "";
    if (Array.isArray(v)) return v.join(", ");
    if (typeof v === "object") return JSON.stringify(v);
    return String(v);
}
