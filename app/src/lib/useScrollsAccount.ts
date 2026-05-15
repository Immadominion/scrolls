"use client";

// ─────────────────────────────────────────────────
// Safe wallet hooks for Scrolls.
//
// The base hooks from @mysten/dapp-kit-react throw if called outside the
// DAppKitProvider. Our Providers component delays mounting the provider
// until after hydration, so during the first client render (and during
// the static build pre-render) the provider is absent.
//
// These wrappers swallow that case by guarding with a mount flag and
// returning null/undefined until the provider context is ready.
// ─────────────────────────────────────────────────

import { useEffect, useState } from "react";
import {
    useCurrentAccount,
    useCurrentNetwork,
    useCurrentWallet,
    useDAppKit,
    useWallets,
} from "@mysten/dapp-kit-react";

function useMounted(): boolean {
    const [mounted, setMounted] = useState(false);
    useEffect(() => {
        setMounted(true);
    }, []);
    return mounted;
}

export function useScrollsAccount() {
    const mounted = useMounted();
    let account: ReturnType<typeof useCurrentAccount> | null = null;
    try {
        // Hook is always called in the same order; only the throw
        // (no provider yet) is suppressed.
        account = useCurrentAccount();
    } catch {
        account = null;
    }
    return mounted ? account : null;
}

export function useScrollsNetwork() {
    const mounted = useMounted();
    let network: ReturnType<typeof useCurrentNetwork> | null = null;
    try {
        network = useCurrentNetwork();
    } catch {
        network = null;
    }
    return mounted ? network : null;
}

export function useScrollsDAppKit() {
    const mounted = useMounted();
    let dapp: ReturnType<typeof useDAppKit> | null = null;
    try {
        dapp = useDAppKit();
    } catch {
        dapp = null;
    }
    return mounted ? dapp : null;
}

export function useScrollsWallet() {
    const mounted = useMounted();
    let wallet: ReturnType<typeof useCurrentWallet> | null = null;
    try {
        wallet = useCurrentWallet();
    } catch {
        wallet = null;
    }
    return mounted ? wallet : null;
}

export function useScrollsWallets() {
    const mounted = useMounted();
    let wallets: ReturnType<typeof useWallets> = [];
    try {
        wallets = useWallets();
    } catch {
        wallets = [];
    }
    return mounted ? wallets : [];
}
