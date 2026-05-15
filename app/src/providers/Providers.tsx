"use client";

// ─────────────────────────────────────────────────
// Top-level Providers boundary.
//
// `output: 'export'` pre-renders every route at build time. dApp Kit
// detects wallets via `window`, so the provider must only mount in the
// browser. We lazy-import it after first paint and render children
// unwrapped in the meantime — wallet-dependent components must use the
// safe hooks in `lib/useScrollsAccount`.
// ─────────────────────────────────────────────────

import { useEffect, useState, type ComponentType, type ReactNode } from "react";
import { getDAppKit, type ScrollsDAppKit } from "@/lib/dapp-kit";

type ProviderComponent = ComponentType<{
    dAppKit: ScrollsDAppKit;
    children: ReactNode;
}>;

export default function Providers({ children }: { children: ReactNode }) {
    const [Provider, setProvider] = useState<ProviderComponent | null>(null);
    const [dAppKit, setDAppKit] = useState<ScrollsDAppKit | null>(null);

    useEffect(() => {
        let cancelled = false;
        import("@mysten/dapp-kit-react").then((mod) => {
            if (!cancelled) {
                setProvider(() => mod.DAppKitProvider as ProviderComponent);
                setDAppKit(getDAppKit());
            }
        });
        return () => {
            cancelled = true;
        };
    }, []);

    if (!Provider || !dAppKit) {
        return <>{children}</>;
    }

    return (
        <Provider dAppKit={dAppKit}>
            {children}
        </Provider>
    );
}
