# Scrolls — Move Package

On-chain registry, submission receipts, and Seal access policy for Scrolls.

## Modules

| Module | What it owns |
|---|---|
| `form_pointer` | `FormPointer` (shared) — pins the *current* Walrus blob id for a form. Updated in place when the owner republishes, so share URLs survive edits. Emits `FormPublished` events for cross-device discovery. |
| `submission_ref` | `SubmissionRef` (frozen) — one per submission. Pins the Walrus blob id of the response JSON and emits `SubmissionRecorded` so the form owner can list submissions without a localStorage index. |
| `seal_policy` | `FormPolicy` (shared) — the access object Seal key servers consult. Holds the form owner + an admin allowlist; `seal_approve_decrypt` aborts unless the caller is in that set. |

## Deployed addresses

### Sui testnet (current default)

```
package        0x6418bc0c11e75ef443f7e8fedb9a860b6cc3bfe5909481dc309472ad8b7b10a0
upgrade cap    0x8df3123b86ecfdc37f5f57af2c6bd6720d9ba74a3ea3eb2de3689b4e295e80c9
```

These are wired into `app/src/lib/contracts.ts` under `SCROLLS_PACKAGES.testnet`.

### Sui mainnet

Not published yet. The hybrid deployment profile (Walrus mainnet + Sui testnet) keeps the registry free while production data permanence comes from Walrus mainnet. To publish on mainnet:

```bash
cd move/scrolls
sui client switch --env mainnet
sui client publish --gas-budget 200000000
# copy `Published Object → packageId` into app/src/lib/contracts.ts
# copy `Created Objects → UpgradeCap` into Published.toml
```

Then set `NEXT_PUBLIC_SUI_NETWORK=mainnet` in the app env.

## Build & test locally

```bash
sui move build
sui move test
```

## Upgrade flow

The package is built with `--upgrade-policy compatible` (default). To ship a new version:

```bash
sui client upgrade --upgrade-capability <UpgradeCap-id> --gas-budget 200000000
# update Published.toml -> [published.<env>] published-at = "<new pkg id>"
# update app/src/lib/contracts.ts SCROLLS_PACKAGES.<env>
```

See [`docs/SPEC.md`](../../docs/SPEC.md) for the data-flow diagrams.
