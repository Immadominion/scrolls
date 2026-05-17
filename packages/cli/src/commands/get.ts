// `scrolls get <formId>` — fetch and print a form config.

import { buildClient, type ClientFlags } from "../client-factory.js";
import { banner, fail, ok, kv, dim, cyan, bold } from "../ui.js";

interface GetOptions extends ClientFlags {
    json?: boolean;
}

export async function runGet(formId: string, opts: GetOptions): Promise<void> {
    if (!opts.json) banner();
    const { client } = await buildClient(opts);

    let form;
    try {
        form = await client.getForm(formId);
    } catch (err) {
        fail((err as Error).message);
    }

    if (opts.json) {
        process.stdout.write(JSON.stringify(form, null, 2) + "\n");
        return;
    }

    ok(`Form ${bold(form.title)}`);
    if (form.description) console.log(`  ${dim(form.description)}`);
    kv("ID", formId);
    kv("Fields", String(form.fields.length));
    kv("Private", form.settings.isPrivate ? "yes" : "no");
    kv("Owner", form.ownerAddress);
    kv("Share", cyan(client.shareUrl(formId)));
    console.log("");
    console.log(`  ${bold("Fields")}`);
    for (const f of form.fields) {
        console.log(`    ${dim("·")} ${f.label} ${dim(`(${f.type}${f.required ? ", required" : ""})`)}`);
    }
}
