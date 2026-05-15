"use client";

// ─────────────────────────────────────────────────
// Manage admins for a Seal FormPolicy.
//
// Owner sees the current admin list (loaded from the on-chain object)
// and can add/remove addresses. Each mutation pops the wallet for a tx
// signature and refreshes the list on success.
//
// Mounted inside ResponsesPage when the form has a `policyId`.
// ─────────────────────────────────────────────────

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Icon } from "@iconify/react";
import clsx from "clsx";
import { useScrollsAccount, useScrollsDAppKit } from "@/lib/useScrollsAccount";
import { addAdmin, getPolicy, removeAdmin, type FormPolicySummary } from "@/lib/registry";
import { truncateAddress } from "@/lib/sui";

const easing = [0.25, 0.4, 0.25, 1] as const;

function isValidSuiAddress(s: string): boolean {
    return /^0x[0-9a-fA-F]{1,64}$/.test(s.trim());
}

export default function AdminPanel({
    policyId,
    onClose,
}: {
    policyId: string;
    onClose: () => void;
}) {
    const account = useScrollsAccount();
    const dAppKit = useScrollsDAppKit();
    const [policy, setPolicy] = useState<FormPolicySummary | null>(null);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [pending, setPending] = useState<string | null>(null);
    const [actionError, setActionError] = useState<string | null>(null);
    const [newAdmin, setNewAdmin] = useState("");

    const refresh = async () => {
        setLoading(true);
        setLoadError(null);
        try {
            const p = await getPolicy(policyId);
            if (!p) {
                setLoadError("Policy object not found on the active network.");
            } else {
                setPolicy(p);
            }
        } catch (err) {
            setLoadError(err instanceof Error ? err.message : "Failed to load policy.");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        void refresh();
    }, [policyId]); // eslint-disable-line react-hooks/exhaustive-deps

    const isOwner = !!(account?.address && policy && account.address === policy.owner);

    const handleAdd = async () => {
        if (!dAppKit || !isOwner) return;
        const addr = newAdmin.trim();
        if (!isValidSuiAddress(addr)) {
            setActionError("Enter a valid Sui address (0x...)");
            return;
        }
        if (policy?.admins.includes(addr)) {
            setActionError("Already an admin.");
            return;
        }
        setActionError(null);
        setPending("add");
        try {
            await addAdmin(dAppKit, policyId, addr);
            setNewAdmin("");
            await refresh();
        } catch (err) {
            setActionError(err instanceof Error ? err.message : "Failed to add admin.");
        } finally {
            setPending(null);
        }
    };

    const handleRemove = async (addr: string) => {
        if (!dAppKit || !isOwner) return;
        setActionError(null);
        setPending(addr);
        try {
            await removeAdmin(dAppKit, policyId, addr);
            await refresh();
        } catch (err) {
            setActionError(err instanceof Error ? err.message : "Failed to remove admin.");
        } finally {
            setPending(null);
        }
    };

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
            onClick={(e) => {
                if (e.target === e.currentTarget && !pending) onClose();
            }}
        >
            <motion.div
                initial={{ opacity: 0, scale: 0.96, y: 8 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                transition={{ duration: 0.25, ease: easing }}
                className="w-full max-w-md rounded-2xl border border-[color:var(--border-default)] bg-[color:var(--surface-solid)] p-6 shadow-2xl"
            >
                <div className="flex items-start justify-between gap-3 mb-4">
                    <div>
                        <p className="text-[10px] uppercase tracking-wider text-[color:var(--text-muted)] mb-1">
                            Seal access policy
                        </p>
                        <h2 className="text-lg font-display font-bold text-[color:var(--text-primary)]">
                            Decryption admins
                        </h2>
                    </div>
                    <button
                        onClick={onClose}
                        disabled={!!pending}
                        className="text-[color:var(--text-muted)] hover:text-[color:var(--text-primary)] transition-colors disabled:opacity-40"
                        aria-label="Close"
                    >
                        <Icon icon="fluent:dismiss-24-regular" className="w-5 h-5" />
                    </button>
                </div>

                {loading ? (
                    <div className="flex items-center gap-2 text-sm text-[color:var(--text-secondary)] py-6 justify-center">
                        <Icon icon="fluent:spinner-ios-20-regular" className="w-4 h-4 animate-spin" />
                        Loading policy…
                    </div>
                ) : loadError ? (
                    <p className="text-sm text-[color:var(--status-danger)] py-6">{loadError}</p>
                ) : policy ? (
                    <>
                        <div className="space-y-3 mb-5">
                            <div className="text-xs text-[color:var(--text-muted)]">
                                Owner{" "}
                                <span className="font-mono text-[color:var(--text-secondary)]">
                                    {truncateAddress(policy.owner)}
                                </span>
                            </div>

                            <div>
                                <p className="text-xs text-[color:var(--text-muted)] mb-2">
                                    Admins ({policy.admins.length})
                                </p>
                                {policy.admins.length === 0 ? (
                                    <p className="text-xs text-[color:var(--text-soft)] italic py-2">
                                        Only the owner can decrypt right now.
                                    </p>
                                ) : (
                                    <ul className="space-y-1.5">
                                        {policy.admins.map((addr) => (
                                            <li
                                                key={addr}
                                                className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-[color:var(--background-subtle)] border border-[color:var(--border-subtle)]"
                                            >
                                                <span className="font-mono text-xs text-[color:var(--text-secondary)] truncate">
                                                    {truncateAddress(addr)}
                                                </span>
                                                {isOwner && (
                                                    <button
                                                        onClick={() => void handleRemove(addr)}
                                                        disabled={!!pending}
                                                        className="text-[color:var(--text-muted)] hover:text-[color:var(--status-danger)] transition-colors disabled:opacity-40 shrink-0"
                                                        aria-label={`Remove ${addr}`}
                                                    >
                                                        {pending === addr ? (
                                                            <Icon icon="fluent:spinner-ios-20-regular" className="w-4 h-4 animate-spin" />
                                                        ) : (
                                                            <Icon icon="fluent:delete-24-regular" className="w-4 h-4" />
                                                        )}
                                                    </button>
                                                )}
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </div>
                        </div>

                        {isOwner ? (
                            <div className="border-t border-[color:var(--border-subtle)] pt-4">
                                <p className="text-xs text-[color:var(--text-muted)] mb-2">
                                    Grant decryption access to another wallet
                                </p>
                                <div className="flex items-center gap-2">
                                    <input
                                        type="text"
                                        value={newAdmin}
                                        onChange={(e) => setNewAdmin(e.target.value)}
                                        placeholder="0x…"
                                        spellCheck={false}
                                        className="flex-1 px-3 py-2 rounded-lg bg-[color:var(--background-subtle)] border border-[color:var(--border-subtle)] text-xs font-mono text-[color:var(--text-primary)] placeholder:text-[color:var(--text-soft)] focus:outline-none focus:border-[color:var(--brand-primary)] transition-colors"
                                    />
                                    <button
                                        onClick={() => void handleAdd()}
                                        disabled={!!pending || !newAdmin.trim()}
                                        className={clsx(
                                            "inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed",
                                            "bg-[color:var(--brand-primary)] text-white hover:opacity-90",
                                        )}
                                    >
                                        {pending === "add" ? (
                                            <Icon icon="fluent:spinner-ios-20-regular" className="w-3.5 h-3.5 animate-spin" />
                                        ) : (
                                            <>
                                                <Icon icon="fluent:add-24-regular" className="w-3.5 h-3.5" />
                                                Add
                                            </>
                                        )}
                                    </button>
                                </div>
                                {actionError && (
                                    <p className="text-[11px] text-[color:var(--status-danger)] mt-2">
                                        {actionError}
                                    </p>
                                )}
                            </div>
                        ) : (
                            <p className="text-[11px] text-[color:var(--text-muted)] italic">
                                Connect the form owner wallet to add or remove admins.
                            </p>
                        )}
                    </>
                ) : null}
            </motion.div>
        </div>
    );
}
