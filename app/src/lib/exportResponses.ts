// ─────────────────────────────────────────────────────
// Export utilities for responses (JSON + CSV)
// ─────────────────────────────────────────────────────

import type { FormConfig, Submission, SubmissionResponse } from "@/types";

export interface ExportableResponse {
    submissionId: string;
    submissionBlobId: string;
    submittedAt: string;
    submitterAddress?: string;
    isEncrypted: boolean;
    isDecrypted: boolean;
    responses: Record<string, string | string[] | number | boolean>;
}

/**
 * Export responses as JSON.
 * Includes metadata about decryption status.
 */
export function exportResponsesAsJSON(
    formConfig: FormConfig,
    exportableResponses: ExportableResponse[],
): string {
    const data = {
        form: {
            id: formConfig.id,
            title: formConfig.title,
            walrusBlobId: formConfig.walrusBlobId,
            isPrivate: formConfig.settings.isPrivate,
            exportedAt: new Date().toISOString(),
        },
        responses: exportableResponses,
    };
    return JSON.stringify(data, null, 2);
}

/**
 * Export responses as CSV.
 * Rows are flattened with field labels as columns.
 * Encrypted but undeckrypted rows are excluded.
 */
export function exportResponsesAsCSV(
    formConfig: FormConfig,
    exportableResponses: ExportableResponse[],
): string {
    // Build column headers: submission metadata + field labels
    const fieldLabels = formConfig.fields.map((f) => f.label);
    const headers = [
        "Submission ID",
        "Submitted At",
        "Submitter",
        "Status",
        ...fieldLabels,
    ];

    const rows: string[][] = [];

    for (const resp of exportableResponses) {
        // Skip encrypted but undecrypted responses
        if (resp.isEncrypted && !resp.isDecrypted) {
            continue;
        }

        const status = resp.isEncrypted ? "encrypted" : "public";
        const submitter = resp.submitterAddress || "(anonymous)";
        const rowValues = [
            escapeCSV(resp.submissionId),
            escapeCSV(resp.submittedAt),
            escapeCSV(submitter),
            status,
        ];

        // Add field responses in the same order as headers
        for (const field of formConfig.fields) {
            const fieldValue = resp.responses[field.label] ?? "";
            const csv = formatValueForCSV(fieldValue);
            rowValues.push(escapeCSV(csv));
        }

        rows.push(rowValues);
    }

    // Combine headers + rows
    const csv = [
        headers.map(escapeCSV).join(","),
        ...rows.map((r) => r.join(",")),
    ].join("\n");

    return csv;
}

/**
 * Trigger a browser download for a string (JSON or CSV).
 */
export function downloadFile(
    filename: string,
    content: string,
    mimeType: string,
): void {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

function formatValueForCSV(value: string | string[] | number | boolean): string {
    if (Array.isArray(value)) {
        return value.join("; ");
    }
    return String(value);
}

function escapeCSV(value: string): string {
    // If the value contains a comma, newline, or quote, wrap it in quotes
    // and escape internal quotes by doubling them.
    if (value.includes(",") || value.includes("\n") || value.includes('"')) {
        return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
}
