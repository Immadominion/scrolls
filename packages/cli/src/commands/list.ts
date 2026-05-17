// `scrolls list` — list forms published by the configured address.

import { buildClient, type ClientFlags } from "../client-factory.js";
import { banner, fail, dim, bold, cyan, kv, ok, info, truncate } from "../ui.js";

interface ListOptions extends ClientFlags {
    address?: string;
    json?: boolean;
}

export async function runList(opts: ListOptions): Promise<void> {
    if (!opts.json) banner();
    const { client, config } = await buildClient(opts);

    let forms;
    try {
        forms = await client.listForms(opts.address);
    } catch (err) {
        fail((err as Error).message);
    }

    if (opts.json) {
        process.stdout.write(JSON.stringify(forms, null, 2) + "\n");
        return;
    }

    if (!forms.length) {
        info(`No forms published on ${config.network}.`);
        return;
    }

    ok(`${forms.length} form${forms.length === 1 ? "" : "s"} on ${config.network}`);
    console.log("");
    for (const f of forms) {
        console.log(`  ${bold(truncate(f.pointerId))}`);
        kv("Blob", truncate(f.blobId));
        kv("Version", String(f.version));
        kv("Updated", new Date(f.updatedAtMs).toISOString());
        kv("Share", cyan(client.shareUrl(f.pointerId)));
        console.log(`  ${dim("─".repeat(40))}`);
    }
}
