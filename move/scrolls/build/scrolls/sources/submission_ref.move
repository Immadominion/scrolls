// ─────────────────────────────────────────────────
// Scrolls — SubmissionRef
//
// A frozen, sender-owned object that pins a Walrus blob containing a
// single submission's JSON. The matching `SubmissionRecorded` event lets
// the form owner (and any indexer) enumerate submissions for a given
// `FormPointer` cross-device, replacing the per-browser localStorage
// index that the MVP relied on.
//
// `record` is permissionless: anyone with a Sui wallet can attest to a
// submission for any FormPointer. Anti-spam is enforced off-chain by
// the form's settings (`allowAnonymous`, `maxResponses`, etc) — the
// chain does not validate form contents.
// ─────────────────────────────────────────────────

module scrolls::submission_ref;

use sui::event;
use sui::clock::{Self, Clock};
use scrolls::form_pointer::{Self, FormPointer};

// ── Errors ───────────────────────────────────────

const EEmptyBlobId: u64 = 0;

// ── Types ────────────────────────────────────────

/// Frozen object — created and immediately frozen so submitters cannot
/// edit or delete the receipt after the fact. The form owner reads
/// these via `getOwnedObjects` for their pointer or via the
/// `SubmissionRecorded` event stream.
public struct SubmissionRef has key {
    id: UID,
    form_pointer_id: ID,
    blob_id: vector<u8>,
    submitter: address,
    submitted_at_ms: u64,
}

// ── Events ───────────────────────────────────────

public struct SubmissionRecorded has copy, drop {
    submission_ref_id: ID,
    form_pointer_id: ID,
    blob_id: vector<u8>,
    submitter: address,
    submitted_at_ms: u64,
}

// ── Entries ──────────────────────────────────────

/// Record a submission against an existing FormPointer. The pointer is
/// passed by reference (read-only) purely to bind the link to a real,
/// existing form on chain — the ID alone could be forged in the event,
/// but referencing the shared object guarantees it exists at txn time.
entry fun record(
    pointer: &FormPointer,
    blob_id: vector<u8>,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    assert!(!blob_id.is_empty(), EEmptyBlobId);
    let now = clock::timestamp_ms(clock);
    let submitter = ctx.sender();
    let form_pointer_id = object::id(pointer);
    let _ = form_pointer::owner(pointer); // silence unused-import lint
    let receipt = SubmissionRef {
        id: object::new(ctx),
        form_pointer_id,
        blob_id,
        submitter,
        submitted_at_ms: now,
    };
    event::emit(SubmissionRecorded {
        submission_ref_id: object::id(&receipt),
        form_pointer_id,
        blob_id,
        submitter,
        submitted_at_ms: now,
    });
    // Freeze so the receipt is immutable evidence — never transferable
    // or deletable. The form owner can still discover it via the event.
    transfer::freeze_object(receipt);
}

// ── Read accessors ───────────────────────────────

public fun form_pointer_id(r: &SubmissionRef): ID { r.form_pointer_id }
public fun blob_id(r: &SubmissionRef): vector<u8> { r.blob_id }
public fun submitter(r: &SubmissionRef): address { r.submitter }
public fun submitted_at_ms(r: &SubmissionRef): u64 { r.submitted_at_ms }
