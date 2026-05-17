// ─────────────────────────────────────────────────
// Spec parser
//
// Accepts either a JSON or YAML string describing a form and produces a
// canonical `FormConfig` ready to be uploaded to Walrus.
//
// The spec format is deliberately minimal — only `title` and `fields`
// are required. Field IDs and timestamps are generated for you.
// ─────────────────────────────────────────────────

import { randomUUID } from "node:crypto";
import { parse as parseYaml } from "yaml";
import type {
    FieldOption,
    FieldType,
    FormConfig,
    FormField,
    FormFieldSpec,
    FormSettings,
    FormSpec,
} from "./types.js";

const VALID_TYPES: ReadonlySet<FieldType> = new Set<FieldType>([
    "short_text",
    "long_text",
    "rich_text",
    "dropdown",
    "multi_select",
    "star_rating",
    "file_upload",
    "video_upload",
    "url",
    "confirm_checkbox",
]);

const TYPES_REQUIRING_OPTIONS: ReadonlySet<FieldType> = new Set<FieldType>([
    "dropdown",
    "multi_select",
]);

const DEFAULT_SETTINGS: FormSettings = {
    isPrivate: false,
    allowAnonymous: true,
};

/**
 * Parse a string containing JSON or YAML into a typed `FormSpec`.
 * Detects format from the first non-whitespace character: `{` or `[`
 * means JSON, anything else is treated as YAML.
 */
export function parseSpecString(input: string): FormSpec {
    const trimmed = input.trimStart();
    const looksLikeJson = trimmed.startsWith("{") || trimmed.startsWith("[");
    const raw = looksLikeJson
        ? (JSON.parse(input) as unknown)
        : (parseYaml(input) as unknown);
    return assertFormSpec(raw);
}

/**
 * Validate an arbitrary object as a `FormSpec`. Throws a descriptive
 * `Error` on the first violation rather than collecting them all — the
 * CLI surfaces the message as-is.
 */
export function assertFormSpec(value: unknown): FormSpec {
    if (!value || typeof value !== "object") {
        throw new Error("Form spec must be an object.");
    }
    const v = value as Record<string, unknown>;
    if (typeof v.title !== "string" || v.title.trim() === "") {
        throw new Error("Form spec: `title` is required and must be a non-empty string.");
    }
    if (!Array.isArray(v.fields) || v.fields.length === 0) {
        throw new Error("Form spec: `fields` must be a non-empty array.");
    }
    const fields = v.fields.map((f, i) => assertFieldSpec(f, i));
    const settings = v.settings && typeof v.settings === "object"
        ? (v.settings as Partial<FormSettings>)
        : undefined;
    return {
        title: v.title,
        description: typeof v.description === "string" ? v.description : undefined,
        settings,
        fields,
    };
}

function assertFieldSpec(value: unknown, index: number): FormFieldSpec {
    if (!value || typeof value !== "object") {
        throw new Error(`fields[${index}] must be an object.`);
    }
    const v = value as Record<string, unknown>;
    if (typeof v.type !== "string" || !VALID_TYPES.has(v.type as FieldType)) {
        throw new Error(
            `fields[${index}].type must be one of: ${[...VALID_TYPES].join(", ")}`,
        );
    }
    const type = v.type as FieldType;
    if (typeof v.label !== "string" || v.label.trim() === "") {
        throw new Error(`fields[${index}].label is required.`);
    }
    if (TYPES_REQUIRING_OPTIONS.has(type)) {
        if (!Array.isArray(v.options) || v.options.length === 0) {
            throw new Error(
                `fields[${index}] (${type}) requires a non-empty \`options\` array.`,
            );
        }
    }
    return {
        type,
        label: v.label,
        placeholder: typeof v.placeholder === "string" ? v.placeholder : undefined,
        required: typeof v.required === "boolean" ? v.required : false,
        options: Array.isArray(v.options) ? (v.options as Array<string | FieldOption>) : undefined,
        maxStars: typeof v.maxStars === "number" ? v.maxStars : undefined,
        maxFileSizeMB: typeof v.maxFileSizeMB === "number" ? v.maxFileSizeMB : undefined,
        acceptedTypes: Array.isArray(v.acceptedTypes)
            ? (v.acceptedTypes as string[]).filter((s) => typeof s === "string")
            : undefined,
    };
}

/**
 * Materialise a `FormSpec` into the on-the-wire `FormConfig` that the
 * web app expects to find on Walrus. The result is pure data — call
 * `walrus.uploadJSON()` to publish.
 */
export function specToFormConfig(
    spec: FormSpec,
    ownerAddress: string,
): FormConfig {
    const now = new Date().toISOString();
    const fields: FormField[] = spec.fields.map((f) => normaliseField(f));
    const settings: FormSettings = {
        ...DEFAULT_SETTINGS,
        ...(spec.settings ?? {}),
    };
    return {
        id: randomUUID(),
        title: spec.title,
        description: spec.description,
        fields,
        settings,
        createdAt: now,
        updatedAt: now,
        ownerAddress,
    };
}

function normaliseField(spec: FormFieldSpec): FormField {
    const options = spec.options?.map((o): FieldOption => {
        if (typeof o === "string") return { id: randomUUID(), label: o };
        return { id: o.id || randomUUID(), label: o.label };
    });
    const out: FormField = {
        id: randomUUID(),
        type: spec.type,
        label: spec.label,
        required: spec.required ?? false,
    };
    if (spec.placeholder !== undefined) out.placeholder = spec.placeholder;
    if (options !== undefined) out.options = options;
    if (spec.maxStars !== undefined) out.maxStars = spec.maxStars;
    if (spec.maxFileSizeMB !== undefined) out.maxFileSizeMB = spec.maxFileSizeMB;
    if (spec.acceptedTypes !== undefined) out.acceptedTypes = spec.acceptedTypes;
    return out;
}
