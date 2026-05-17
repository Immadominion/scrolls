// `scrolls submit <formId> <responses.json>` — submit a response from the CLI.
//
// The responses file is an array of `{ fieldId, value }` objects, or
// a plain object whose keys are field ids. Examples:
//
//   [{ "fieldId": "title", "value": "Bug in dashboard" }]
//   { "title": "Bug in dashboard", "severity": "high" }

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { SubmissionResponse } from "@scrolls/sdk";
import { buildClient, type ClientFlags } from "../client-factory.js";
import { banner, ok, kv, fail } from "../ui.js";

interface SubmitOptions extends ClientFlags {
    json?: boolean;
}

export async function runSubmit(
    formId: string,
    responsesPath: string,
    opts: SubmitOptions,
): Promise<void> {
    const abs = resolve(process.cwd(), responsesPath);
    let parsed: unknown;
    try {
        parsed = JSON.parse(await readFile(abs, "utf8"));
    } catch (err) {
        fail(`Failed to read ${abs}: ${(err as Error).message}`);
    }

    const responses = normalise(parsed);
    const { client } = await buildClient(opts);

    let result;
    try {
        result = await client.submit(formId, responses);
    } catch (err) {
        fail((err as Error).message);
    }

    if (opts.json) {
        process.stdout.write(JSON.stringify(result, null, 2) + "\n");
        return;
    }

    banner();
    ok("Submitted.");
    kv("Submission", result.submissionId);
    kv("Blob", result.blobId);
    if (result.txDigest) kv("Tx", result.txDigest);
}

function normalise(input: unknown): SubmissionResponse[] {
    if (Array.isArray(input)) {
        return input.map((r) => {
            if (!r || typeof r !== "object" || !("fieldId" in r)) {
                fail("Each response must be an object with fieldId and value.");
            }
            const obj = r as { fieldId: unknown; value: unknown };
            if (typeof obj.fieldId !== "string") fail("fieldId must be a string.");
            return { fieldId: obj.fieldId, value: obj.value as SubmissionResponse["value"] };
        });
    }
    if (input && typeof input === "object") {
        return Object.entries(input as Record<string, unknown>).map(([fieldId, value]) => ({
            fieldId,
            value: value as SubmissionResponse["value"],
        }));
    }
    fail("Responses file must be an array or an object.");
}
