"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Icon } from "@iconify/react";
import clsx from "clsx";
import type { UiWallet, UiWalletAccount } from "@mysten/dapp-kit-react";
import {
    useScrollsAccount,
    useScrollsDAppKit,
    useScrollsNetwork,
    useScrollsWallet,
    useScrollsWallets,
} from "@/lib/useScrollsAccount";
import { truncateAddress } from "@/lib/sui";

interface WalletButtonProps {
    className?: string;
    panelClassName?: string;
}

const panelTransition = {
    duration: 0.22,
    ease: [0.25, 0.4, 0.25, 1] as const,
};

export default function WalletButton({
    className,
    panelClassName,
}: WalletButtonProps) {
    const account = useScrollsAccount();
    const currentWallet = useScrollsWallet();
    const wallets = useScrollsWallets();
    const dappKit = useScrollsDAppKit();
    const network = useScrollsNetwork();
    const prefersReducedMotion = useReducedMotion();
    const [open, setOpen] = useState(false);
    const [actionError, setActionError] = useState<string | null>(null);
    const [pendingWalletName, setPendingWalletName] = useState<string | null>(null);
    const [isDisconnecting, setIsDisconnecting] = useState(false);
    const [copiedAddress, setCopiedAddress] = useState(false);
    const menuId = useId();
    const rootRef = useRef<HTMLDivElement | null>(null);

    const availableWallets = useMemo(() => {
        return [...wallets].sort((left, right) => {
            if (left.name === currentWallet?.name) return -1;
            if (right.name === currentWallet?.name) return 1;
            return left.name.localeCompare(right.name);
        });
    }, [currentWallet?.name, wallets]);

    const alternativeWallets = useMemo(() => {
        return availableWallets.filter((wallet) => wallet.name !== currentWallet?.name);
    }, [availableWallets, currentWallet?.name]);

    const selectableAccounts = useMemo(() => {
        return Array.from(currentWallet?.accounts ?? []).sort((left, right) =>
            left.address.localeCompare(right.address),
        );
    }, [currentWallet?.accounts]);

    const isBusy = pendingWalletName !== null || isDisconnecting;

    useEffect(() => {
        if (!open) return;

        function handlePointerDown(event: PointerEvent) {
            if (!rootRef.current?.contains(event.target as Node)) {
                setOpen(false);
            }
        }

        function handleKeyDown(event: KeyboardEvent) {
            if (event.key === "Escape") {
                setOpen(false);
            }
        }

        document.addEventListener("pointerdown", handlePointerDown);
        document.addEventListener("keydown", handleKeyDown);

        return () => {
            document.removeEventListener("pointerdown", handlePointerDown);
            document.removeEventListener("keydown", handleKeyDown);
        };
    }, [open]);

    useEffect(() => {
        setActionError(null);
    }, [account?.address, currentWallet?.name]);

    useEffect(() => {
        if (!copiedAddress) return;
        const timeoutId = window.setTimeout(() => setCopiedAddress(false), 1600);
        return () => window.clearTimeout(timeoutId);
    }, [copiedAddress]);

    async function handleConnect(wallet: UiWallet) {
        if (!dappKit || isBusy) return;

        setActionError(null);
        setPendingWalletName(wallet.name);

        try {
            await dappKit.connectWallet({ wallet });
            setOpen(false);
        } catch (error) {
            setActionError(
                error instanceof Error ? error.message : `Could not connect to ${wallet.name}.`,
            );
        } finally {
            setPendingWalletName(null);
        }
    }

    async function handleDisconnect() {
        if (!dappKit || isBusy) return;

        setActionError(null);
        setIsDisconnecting(true);

        try {
            await dappKit.disconnectWallet();
            setOpen(false);
        } catch (error) {
            setActionError(
                error instanceof Error ? error.message : "Could not disconnect the current wallet.",
            );
        } finally {
            setIsDisconnecting(false);
        }
    }

    async function handleSwitchAccount(nextAccount: UiWalletAccount) {
        if (!dappKit || isBusy || account?.address === nextAccount.address) return;

        setActionError(null);
        setPendingWalletName(currentWallet?.name ?? "wallet");

        try {
            await dappKit.switchAccount({ account: nextAccount });
            setOpen(false);
        } catch (error) {
            setActionError(
                error instanceof Error ? error.message : "Could not switch to that account.",
            );
        } finally {
            setPendingWalletName(null);
        }
    }

    async function handleCopyAddress() {
        if (!account?.address || typeof navigator === "undefined" || !navigator.clipboard) {
            return;
        }

        try {
            await navigator.clipboard.writeText(account.address);
            setCopiedAddress(true);
        } catch {
            setActionError("Could not copy the connected address.");
        }
    }

    if (!dappKit) {
        return (
            <div
                aria-hidden
                className={clsx(
                    "h-10 w-[148px] rounded-[16px] border border-[color:var(--border-subtle)] bg-[color:var(--background-subtle)] animate-pulse",
                    className,
                )}
            />
        );
    }

    const buttonLabel = account?.address ? truncateAddress(account.address) : "Connect Wallet";

    return (
        <div ref={rootRef} className="relative shrink-0">
            <button
                type="button"
                aria-expanded={open}
                aria-haspopup="menu"
                aria-controls={open ? menuId : undefined}
                onClick={() => setOpen((current) => !current)}
                className={clsx(
                    "group inline-flex min-h-10 items-center gap-2 rounded-[16px] border border-[color:var(--border-subtle)] bg-[color:var(--background-subtle)] px-3 py-1.5 text-sm font-medium text-[color:var(--text-primary)] shadow-[0_8px_24px_-20px_rgba(0,0,0,0.35)] transition-[background-color,border-color,color] duration-200 hover:border-[color:var(--border-default)] hover:bg-[color:var(--surface-panel)]",
                    account?.address
                        ? "text-[color:var(--text-primary)]"
                        : "text-[color:var(--text-secondary)]",
                    className,
                )}
            >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[10px] border border-[color:var(--border-subtle)] bg-[color:var(--surface-panel)]">
                    {currentWallet?.icon ? (
                        <img
                            src={currentWallet.icon}
                            alt={currentWallet.name}
                            className="h-4 w-4 rounded-sm object-contain"
                        />
                    ) : account?.address ? (
                        <Icon icon="fluent:wallet-credit-card-20-regular" className="h-4 w-4 text-[color:var(--text-secondary)]" />
                    ) : (
                        <Icon icon="fluent:plug-connected-20-filled" className="h-4 w-4 text-[color:var(--text-secondary)]" />
                    )}
                </span>

                <span className="min-w-0 truncate">{buttonLabel}</span>

                <Icon
                    icon="fluent:chevron-down-16-regular"
                    className={clsx(
                        "h-3.5 w-3.5 shrink-0 text-[color:var(--text-tertiary)] transition-all duration-200 group-hover:text-[color:var(--text-primary)]",
                        open && "rotate-180 text-[color:var(--text-primary)]",
                    )}
                />
            </button>

            <AnimatePresence>
                {open && (
                    <motion.div
                        id={menuId}
                        role="menu"
                        initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 10 }}
                        animate={prefersReducedMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
                        exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 8 }}
                        transition={panelTransition}
                        className={clsx(
                            "absolute right-0 top-[calc(100%+12px)] z-50 w-[320px] overflow-hidden rounded-[24px] border border-[color:var(--border-subtle)] bg-[color:var(--surface-panel-strong)] p-2.5 shadow-[var(--shadow-panel)] backdrop-blur-2xl",
                            panelClassName,
                        )}
                    >
                        {account?.address ? (
                            <div className="space-y-2">
                                <div className="rounded-[18px] border border-[color:var(--border-subtle)] bg-[color:var(--background-subtle)] p-3.5">
                                    <div className="flex items-start gap-3">
                                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] border border-[color:var(--border-subtle)] bg-[color:var(--surface-panel)]">
                                            {currentWallet?.icon ? (
                                                <img
                                                    src={currentWallet.icon}
                                                    alt={currentWallet.name}
                                                    className="h-5 w-5 rounded-sm object-contain"
                                                />
                                            ) : (
                                                <Icon icon="fluent:wallet-credit-card-20-regular" className="h-5 w-5 text-[color:var(--text-secondary)]" />
                                            )}
                                        </span>

                                        <div className="min-w-0 flex-1">
                                            <p className="truncate text-sm font-semibold text-[color:var(--text-primary)]">
                                                {currentWallet?.name ?? "Connected wallet"}
                                            </p>
                                            <p className="mt-1 truncate font-mono text-[11px] text-[color:var(--text-tertiary)]">
                                                {account.address}
                                            </p>
                                        </div>

                                        {network && (
                                            <span className="rounded-full border border-[#06b6d4]/15 bg-[#06b6d4]/8 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#7dd3fc]">
                                                {network}
                                            </span>
                                        )}
                                    </div>
                                </div>

                                {selectableAccounts.length > 1 && (
                                    <section className="rounded-[18px] border border-[color:var(--border-subtle)] bg-[color:var(--background-subtle)] p-2">
                                        <p className="px-2 pb-1.5 pt-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-[color:var(--text-tertiary)]">
                                            Accounts
                                        </p>
                                        <div className="space-y-1">
                                            {selectableAccounts.map((walletAccount) => {
                                                const active = walletAccount.address === account.address;

                                                return (
                                                    <button
                                                        key={walletAccount.address}
                                                        type="button"
                                                        role="menuitem"
                                                        disabled={active || isBusy}
                                                        onClick={() => handleSwitchAccount(walletAccount)}
                                                        className={clsx(
                                                            "flex min-h-11 w-full items-center gap-3 rounded-[14px] px-3 py-2 text-left transition-colors duration-200",
                                                            active
                                                                ? "bg-[color:var(--surface-panel)] text-[color:var(--text-primary)]"
                                                                : "text-[color:var(--text-secondary)] hover:bg-[color:var(--surface-panel)]",
                                                            isBusy && "cursor-wait",
                                                        )}
                                                    >
                                                        <span className={clsx(
                                                            "flex h-8 w-8 items-center justify-center rounded-[12px] border border-[color:var(--border-subtle)] bg-[color:var(--surface-panel)]",
                                                            active ? "text-[color:var(--brand-primary)]" : "text-[color:var(--text-secondary)]",
                                                        )}>
                                                            <Icon
                                                                icon={active ? "fluent:checkmark-circle-20-filled" : "fluent:person-circle-20-regular"}
                                                                className="h-[18px] w-[18px]"
                                                            />
                                                        </span>
                                                        <span className="min-w-0 flex-1">
                                                            <span className="block truncate text-sm font-medium">
                                                                {walletAccount.label || truncateAddress(walletAccount.address)}
                                                            </span>
                                                            <span className="mt-0.5 block truncate font-mono text-[11px] text-[color:var(--text-tertiary)]">
                                                                {walletAccount.address}
                                                            </span>
                                                        </span>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </section>
                                )}

                                {alternativeWallets.length > 0 && (
                                    <section className="rounded-[18px] border border-[color:var(--border-subtle)] bg-[color:var(--background-subtle)] p-2">
                                        <p className="px-2 pb-1.5 pt-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-[color:var(--text-tertiary)]">
                                            Switch wallet
                                        </p>
                                        <div className="space-y-1">
                                            {alternativeWallets.map((wallet) => (
                                                <WalletRow
                                                    key={wallet.name}
                                                    wallet={wallet}
                                                    busy={pendingWalletName === wallet.name}
                                                    disabled={isBusy}
                                                    onClick={() => handleConnect(wallet)}
                                                />
                                            ))}
                                        </div>
                                    </section>
                                )}

                                <div className="grid grid-cols-2 gap-2">
                                    <button
                                        type="button"
                                        role="menuitem"
                                        onClick={handleCopyAddress}
                                        className="flex min-h-11 items-center justify-center gap-2 rounded-[16px] border border-[color:var(--border-subtle)] bg-[color:var(--background-subtle)] px-3 text-sm font-medium text-[color:var(--text-secondary)] transition-colors duration-200 hover:bg-[color:var(--surface-panel)]"
                                    >
                                        <Icon
                                            icon={copiedAddress ? "fluent:checkmark-20-filled" : "fluent:copy-20-regular"}
                                            className={clsx("h-[18px] w-[18px]", copiedAddress && "text-[color:var(--brand-primary)]")}
                                        />
                                        {copiedAddress ? "Copied" : "Copy address"}
                                    </button>

                                    <button
                                        type="button"
                                        role="menuitem"
                                        disabled={isBusy}
                                        onClick={handleDisconnect}
                                        className="flex min-h-11 items-center justify-center gap-2 rounded-[16px] border border-[color:var(--status-danger-soft)] bg-[color:var(--status-danger-soft)] px-3 text-sm font-medium text-[color:var(--status-danger-text)] transition-colors duration-200 hover:border-[color:var(--status-danger)] hover:bg-[color:var(--status-danger-soft)] disabled:cursor-wait disabled:opacity-70"
                                    >
                                        <Icon
                                            icon={isDisconnecting ? "fluent:arrow-sync-20-regular" : "fluent:plug-disconnected-20-regular"}
                                            className={clsx("h-[18px] w-[18px]", isDisconnecting && "animate-spin")}
                                        />
                                        {isDisconnecting ? "Disconnecting" : "Disconnect"}
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-2">
                                <div className="rounded-[18px] border border-[color:var(--border-subtle)] bg-[color:var(--background-subtle)] p-3.5">
                                    <p className="text-sm font-semibold text-[color:var(--text-primary)]">Connect a wallet</p>
                                    <p className="mt-1 text-xs leading-relaxed text-[color:var(--text-tertiary)]">
                                        Choose a Sui wallet to view wallet-indexed forms, publish under an address, and decrypt private responses.
                                    </p>
                                </div>

                                {availableWallets.length > 0 ? (
                                    <div className="space-y-1">
                                        {availableWallets.map((wallet) => (
                                            <WalletRow
                                                key={wallet.name}
                                                wallet={wallet}
                                                busy={pendingWalletName === wallet.name}
                                                disabled={isBusy}
                                                onClick={() => handleConnect(wallet)}
                                            />
                                        ))}
                                    </div>
                                ) : (
                                    <div className="rounded-[18px] border border-dashed border-[color:var(--border-subtle)] bg-[color:var(--background-subtle)] px-4 py-5 text-center">
                                        <p className="text-sm font-medium text-[color:var(--text-primary)]">No wallet detected</p>
                                        <p className="mt-1 text-xs leading-relaxed text-[color:var(--text-tertiary)]">
                                            Install a Sui wallet extension (Sui Wallet, Slush, Suiet, or Phantom) to connect.
                                        </p>
                                    </div>
                                )}
                            </div>
                        )}

                        {actionError && (
                            <p className="mt-2 rounded-[16px] border border-[color:var(--status-danger-soft)] bg-[color:var(--status-danger-soft)] px-3 py-2 text-xs text-[color:var(--status-danger-text)]">
                                {actionError}
                            </p>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

function WalletRow({
    wallet,
    busy,
    disabled,
    onClick,
}: {
    wallet: UiWallet;
    busy: boolean;
    disabled: boolean;
    onClick: () => void;
}) {
    return (
        <button
            type="button"
            role="menuitem"
            disabled={disabled}
            onClick={onClick}
            className="flex min-h-12 w-full items-center gap-3 rounded-[16px] border border-transparent bg-[color:var(--background-subtle)] px-3.5 py-2.5 text-left transition-colors duration-200 hover:border-[color:var(--border-default)] hover:bg-[color:var(--surface-panel)] disabled:cursor-wait disabled:opacity-70"
        >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[14px] border border-[color:var(--border-subtle)] bg-[color:var(--surface-panel)]">
                {wallet.icon ? (
                    <img src={wallet.icon} alt={wallet.name} className="h-5 w-5 rounded-sm object-contain" />
                ) : (
                    <Icon icon="fluent:wallet-credit-card-20-regular" className="h-5 w-5 text-[color:var(--text-secondary)]" />
                )}
            </span>

            <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-[color:var(--text-primary)]">{wallet.name}</span>
                <span className="mt-0.5 block text-xs text-[color:var(--text-tertiary)]">
                    {wallet.accounts.length > 0
                        ? `${wallet.accounts.length} account${wallet.accounts.length === 1 ? "" : "s"}`
                        : "Connect and authorize access"}
                </span>
            </span>

            <span className="flex h-7 min-w-7 items-center justify-center rounded-full bg-[color:var(--surface-panel)] px-2 text-[color:var(--text-tertiary)]">
                {busy ? (
                    <Icon icon="fluent:arrow-sync-20-regular" className="h-4 w-4 animate-spin" />
                ) : (
                    <Icon icon="fluent:chevron-right-16-regular" className="h-4 w-4" />
                )}
            </span>
        </button>
    );
}
