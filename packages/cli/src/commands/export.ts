// `scrolls export <formId>` — dump submissions as CSV to stdout or a file.

import { writeFile, readFile } from "node:fs/promises";
import { buildClient, type ClientFlags } from "../client-factory.js";
import { banner, fail, ok, kv, dim } from "../ui.js";

interface ExportOptions extends ClientFlags {
    key?: string;
    out?: string;
}

export async function runExport(formId: string, opts: ExportOptions): Promise<void> {
    const { client } = await buildClient(opts);

    let privateKeyJwk: JsonWebKey | undefined;
    if (opts.key) {
        try {
            const raw = await readFile(opts.key, "utf8");
            const parsed = JSON.parse(raw);
            privateKeyJwk = parsed.privateKeyJwk ?? parsed;
        } catch (err) {
            fail(`Failed to read key file ${opts.key}: ${(err as Error).message}`);
        }
    }

    let csv: string;
    try {
        csv = await client.exportCsv(formId, { privateKeyJwk });
    } catch (err) {
        fail((err as Error).message);
    }

    if (opts.out) {
        await writeFile(opts.out, csv, "utf8");
        banner();
        ok("CSV written.");
        kv("Path", opts.out);
        kv("Rows", String(csv.split("\n").length - 1));
        console.log(`  ${dim("(header included)")}`);
        return;
    }
    process.stdout.write(csv);
    if (!csv.endsWith("\n")) process.stdout.write("\n");
}
