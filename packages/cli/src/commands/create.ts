// `scrolls create <spec.yaml>` — publish a new form.

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, dirname, basename, extname } from "node:path";
import { existsSync } from "node:fs";
import type { FormKeypair } from "@scrolls/sdk";
import { buildClient, type ClientFlags } from "../client-factory.js";
import { banner, ok, info, warn, fail, kv, dim, violet, cyan, bold } from "../ui.js";

interface CreateOptions extends ClientFlags {
    title?: string;
    keyOut?: string;
    json?: boolean;
}

export async function runCreate(specPath: string, opts: CreateOptions): Promise<void> {
    if (!opts.json) banner();

    const absPath = resolve(process.cwd(), specPath);
    if (!existsSync(absPath)) {
        fail(`Spec file not found: ${absPath}`);
    }

    const source = await readFile(absPath, "utf8");
    const { client, config } = await buildClient(opts);

    if (!opts.json) {
        info(`Reading spec ${dim(absPath)}`);
        info(`Uploading to Walrus (${config.network})…`);
    }

    let result;
    try {
        result = await client.createForm(source);
    } catch (err) {
        fail((err as Error).message);
    }

    // If the form is private, the SDK returns a freshly generated
    // decryption keypair. We MUST persist it for the user — it never
    // touches the network.
    let keyFilePath: string | undefined;
    if (result.decryptionKey) {
        const keyOut =
            opts.keyOut ??
            resolve(dirname(absPath), `${basename(absPath, extname(absPath))}.key.json`);
        await writeKeyFile(keyOut, result.formId, result.decryptionKey);
        keyFilePath = keyOut;
    }

    if (opts.json) {
        process.stdout.write(
            JSON.stringify(
                {
                    ...result,
                    keyFile: keyFilePath,
                },
                null,
                2,
            ) + "\n",
        );
        return;
    }

    console.log("");
    ok("Form published.");
    kv("Form ID", result.formId);
    kv("Blob", result.blobId);
    if (result.pointerId) kv("Pointer", result.pointerId);
    if (result.txDigest) kv("Tx", result.txDigest);
    if (keyFilePath) {
        kv("Private key", keyFilePath);
        console.log("");
        warn("Guard this key file. Without it you cannot decrypt responses.");
    }
    console.log("");
    console.log(`  ${bold("Share:")} ${cyan(result.shareUrl)}`);
    console.log(
        `  ${dim("Responses:")} ${dim(violet(`scrolls submissions ${result.formId}`))}`,
    );
}

async function writeKeyFile(path: string, formId: string, key: FormKeypair): Promise<void> {
    const dir = dirname(path);
    if (!existsSync(dir)) await mkdir(dir, { recursive: true });
    const body = JSON.stringify(
        {
            formId,
            algorithm: "ECDH-P256",
            createdAt: new Date().toISOString(),
            publicKeyJwk: key.publicKeyJwk,
            privateKeyJwk: key.privateKeyJwk,
        },
        null,
        2,
    );
    await writeFile(path, body, { encoding: "utf8", mode: 0o600 });
}
