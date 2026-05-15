// ─────────────────────────────────────────────────
// Scrolls — FormPointer
//
// A FormPointer is a shared object that pins the *current* Walrus blob
// containing the form's JSON config. It exists so that:
//
//   1. A form's share URL (`/f?pointer=<objectId>`) survives edits — the
//      pointer's `current_blob_id` field is updated in place when the
//      owner republishes a new version of the form.
//   2. Any device can list a wallet's forms by querying `FormPublished`
//      events filtered by sender — no localStorage required.
//
// Submissions never live inside the FormPointer; they are linked back
// via their own `SubmissionRef` objects and the matching
// `SubmissionRecorded` event (see `submission_ref.move`).
// ─────────────────────────────────────────────────

module scrolls::form_pointer;

use sui::event;
use sui::clock::{Self, Clock};

// ── Errors ───────────────────────────────────────

const ENotOwner: u64 = 0;
const EEmptyBlobId: u64 = 1;

// ── Types ────────────────────────────────────────

/// Shared object owned by the form creator. The `current_blob_id` is
/// the Walrus blob holding the latest `FormConfig` JSON.
public struct FormPointer has key {
    id: UID,
    owner: address,
    current_blob_id: vector<u8>,
    version: u64,
    created_at_ms: u64,
    updated_at_ms: u64,
}

// ── Events ───────────────────────────────────────

public struct FormPublished has copy, drop {
    pointer_id: ID,
    owner: address,
    blob_id: vector<u8>,
    created_at_ms: u64,
}

public struct FormUpdated has copy, drop {
    pointer_id: ID,
    owner: address,
    new_blob_id: vector<u8>,
    version: u64,
    updated_at_ms: u64,
}

// ── Entries ──────────────────────────────────────

/// Publish a new form. Creates a shared FormPointer and emits
/// FormPublished. Anyone watching this event for `owner == sender` can
/// rebuild the dashboard cross-device.
entry fun publish(
    blob_id: vector<u8>,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    assert!(!blob_id.is_empty(), EEmptyBlobId);
    let now = clock::timestamp_ms(clock);
    let owner = ctx.sender();
    let pointer = FormPointer {
        id: object::new(ctx),
        owner,
        current_blob_id: blob_id,
        version: 1,
        created_at_ms: now,
        updated_at_ms: now,
    };
    let pointer_id = object::id(&pointer);
    event::emit(FormPublished {
        pointer_id,
        owner,
        blob_id,
        created_at_ms: now,
    });
    transfer::share_object(pointer);
}

/// Replace the current blob (form was edited and republished). Only the
/// original creator may call this. Bumps `version` and emits
/// FormUpdated. The previous blob remains permanent on Walrus — this
/// only re-points the share URL.
entry fun update(
    pointer: &mut FormPointer,
    new_blob_id: vector<u8>,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    assert!(pointer.owner == ctx.sender(), ENotOwner);
    assert!(!new_blob_id.is_empty(), EEmptyBlobId);
    let now = clock::timestamp_ms(clock);
    pointer.current_blob_id = new_blob_id;
    pointer.version = pointer.version + 1;
    pointer.updated_at_ms = now;
    event::emit(FormUpdated {
        pointer_id: object::id(pointer),
        owner: pointer.owner,
        new_blob_id,
        version: pointer.version,
        updated_at_ms: now,
    });
}

// ── Read accessors ───────────────────────────────

public fun owner(pointer: &FormPointer): address { pointer.owner }
public fun current_blob_id(pointer: &FormPointer): vector<u8> { pointer.current_blob_id }
public fun version(pointer: &FormPointer): u64 { pointer.version }
public fun created_at_ms(pointer: &FormPointer): u64 { pointer.created_at_ms }
public fun updated_at_ms(pointer: &FormPointer): u64 { pointer.updated_at_ms }
