// ─────────────────────────────────────────────────
// Scrolls — Seal access policy
//
// Defines the on-chain policy object that Seal key servers consult to
// decide whether to release a decryption key for an encrypted form
// submission.
//
// The policy is owned by the form creator and lists additional admin
// addresses authorised to decrypt. The Seal `seal_approve_decrypt`
// entry function is what Seal calls during `dry_run_transaction_block`
// — it must abort if the requesting address is not the owner and not
// in the admin allowlist.
//
// One FormPolicy per private form. The ID of this object is what gets
// stored on the FormConfig as the Seal `id` (the namespace identity).
// ─────────────────────────────────────────────────

module scrolls::seal_policy;

use sui::event;

// ── Errors ───────────────────────────────────────

const ENotOwner: u64 = 0;
const ENoAccess: u64 = 1;
const EAlreadyAdmin: u64 = 2;
const ENotAdmin: u64 = 3;
const EIdMismatch: u64 = 4;

// ── Types ────────────────────────────────────────

/// Shared so the form owner and admins can call `seal_approve_decrypt`
/// from any device. Owner-only entries (`add_admin`/`remove_admin`)
/// gate mutation.
public struct FormPolicy has key {
    id: UID,
    owner: address,
    admins: vector<address>,
    created_at_ms: u64,
}

// ── Events ───────────────────────────────────────

public struct PolicyCreated has copy, drop {
    policy_id: ID,
    owner: address,
}

public struct AdminAdded has copy, drop {
    policy_id: ID,
    admin: address,
}

public struct AdminRemoved has copy, drop {
    policy_id: ID,
    admin: address,
}

// ── Entries ──────────────────────────────────────

/// Create a new policy. Returns the shared object's ID via event so the
/// publishing client can copy it into the FormConfig (it's also the
/// Seal namespace `id`).
entry fun create(ctx: &mut TxContext) {
    let owner = ctx.sender();
    let policy = FormPolicy {
        id: object::new(ctx),
        owner,
        admins: vector[],
        created_at_ms: 0, // creation timestamp is observable in the txn; saving Clock here is unnecessary
    };
    event::emit(PolicyCreated { policy_id: object::id(&policy), owner });
    transfer::share_object(policy);
}

/// Add an admin who may decrypt submissions for this form. Owner only.
entry fun add_admin(policy: &mut FormPolicy, admin: address, ctx: &TxContext) {
    assert!(policy.owner == ctx.sender(), ENotOwner);
    assert!(!policy.admins.contains(&admin), EAlreadyAdmin);
    policy.admins.push_back(admin);
    event::emit(AdminAdded { policy_id: object::id(policy), admin });
}

/// Remove an admin. Owner only. Removed admins lose decryption access
/// at their next SessionKey refresh.
entry fun remove_admin(policy: &mut FormPolicy, admin: address, ctx: &TxContext) {
    assert!(policy.owner == ctx.sender(), ENotOwner);
    let (found, index) = policy.admins.index_of(&admin);
    assert!(found, ENotAdmin);
    policy.admins.remove(index);
    event::emit(AdminRemoved { policy_id: object::id(policy), admin });
}

// ── Seal hook ────────────────────────────────────

/// Seal calls this via `dry_run_transaction_block`. Per Seal protocol
/// the first parameter is the requested identity (the namespace ID
/// without the package prefix). For Scrolls, the identity is the BCS
/// encoding of the policy object's ID, so we verify that it matches the
/// policy being checked.
///
/// Function MUST be `entry` (not `public`) so future package upgrades
/// can introduce a versioned variant without breaking existing
/// encryptions. Function MUST abort to deny access — returning has no
/// effect since Seal ignores the return value.
entry fun seal_approve_decrypt(
    id: vector<u8>,
    policy: &FormPolicy,
    ctx: &TxContext,
) {
    let policy_id_bytes = object::id(policy).to_bytes();
    assert!(id == policy_id_bytes, EIdMismatch);
    let caller = ctx.sender();
    assert!(
        caller == policy.owner || policy.admins.contains(&caller),
        ENoAccess,
    );
}

// ── Read accessors ───────────────────────────────

public fun owner(p: &FormPolicy): address { p.owner }
public fun admins(p: &FormPolicy): vector<address> { p.admins }
public fun is_authorized(p: &FormPolicy, who: address): bool {
    who == p.owner || p.admins.contains(&who)
}

// ── Test helpers ─────────────────────────────────
//
// `seal_approve_decrypt` must be `entry`, so Move tests cannot call it
// directly. This wrapper has identical semantics for unit testing.
#[test_only]
public fun test_seal_approve(id: vector<u8>, policy: &FormPolicy, ctx: &TxContext) {
    seal_approve_decrypt(id, policy, ctx)
}
