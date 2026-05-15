// ─────────────────────────────────────────────────
// Scrolls — Move tests
//
// Coverage:
//   form_pointer:  publish (happy), update (happy), update by stranger (abort)
//   submission_ref: record (happy), record empty blob (abort)
//   seal_policy:   create + seal_approve_decrypt for owner / admin /
//                  stranger / removed admin / wrong identity
// ─────────────────────────────────────────────────

#[test_only]
module scrolls::scrolls_tests;

use sui::test_scenario as ts;
use sui::clock;
use scrolls::form_pointer::{Self, FormPointer};
use scrolls::submission_ref;
use scrolls::seal_policy::{Self, FormPolicy};

const OWNER: address = @0xA11CE;
const STRANGER: address = @0xDEAD;
const ADMIN: address = @0xB0B;

// ── form_pointer ─────────────────────────────────

#[test]
fun publish_then_update_happy_path() {
    let mut scenario = ts::begin(OWNER);
    let clk = clock::create_for_testing(scenario.ctx());
    form_pointer::publish(b"blobA", &clk, scenario.ctx());

    scenario.next_tx(OWNER);
    let mut p = scenario.take_shared<FormPointer>();
    assert!(form_pointer::current_blob_id(&p) == b"blobA", 0);
    assert!(form_pointer::version(&p) == 1, 1);

    form_pointer::update(&mut p, b"blobB", &clk, scenario.ctx());
    assert!(form_pointer::current_blob_id(&p) == b"blobB", 2);
    assert!(form_pointer::version(&p) == 2, 3);
    ts::return_shared(p);
    clock::destroy_for_testing(clk);
    ts::end(scenario);
}

#[test]
#[expected_failure(abort_code = scrolls::form_pointer::ENotOwner)]
fun update_by_stranger_aborts() {
    let mut scenario = ts::begin(OWNER);
    let clk = clock::create_for_testing(scenario.ctx());
    form_pointer::publish(b"blobA", &clk, scenario.ctx());

    scenario.next_tx(STRANGER);
    let mut p = scenario.take_shared<FormPointer>();
    form_pointer::update(&mut p, b"blobX", &clk, scenario.ctx());
    ts::return_shared(p);
    clock::destroy_for_testing(clk);
    ts::end(scenario);
}

#[test]
#[expected_failure(abort_code = scrolls::form_pointer::EEmptyBlobId)]
fun publish_empty_blob_aborts() {
    let mut scenario = ts::begin(OWNER);
    let clk = clock::create_for_testing(scenario.ctx());
    form_pointer::publish(b"", &clk, scenario.ctx());
    clock::destroy_for_testing(clk);
    ts::end(scenario);
}

// ── submission_ref ───────────────────────────────

#[test]
fun record_submission_happy_path() {
    let mut scenario = ts::begin(OWNER);
    let clk = clock::create_for_testing(scenario.ctx());
    form_pointer::publish(b"formBlob", &clk, scenario.ctx());

    scenario.next_tx(STRANGER);
    let p = scenario.take_shared<FormPointer>();
    submission_ref::record(&p, b"submissionBlob", &clk, scenario.ctx());
    ts::return_shared(p);
    clock::destroy_for_testing(clk);
    ts::end(scenario);
}

#[test]
#[expected_failure(abort_code = scrolls::submission_ref::EEmptyBlobId)]
fun record_empty_blob_aborts() {
    let mut scenario = ts::begin(OWNER);
    let clk = clock::create_for_testing(scenario.ctx());
    form_pointer::publish(b"formBlob", &clk, scenario.ctx());

    scenario.next_tx(STRANGER);
    let p = scenario.take_shared<FormPointer>();
    submission_ref::record(&p, b"", &clk, scenario.ctx());
    ts::return_shared(p);
    clock::destroy_for_testing(clk);
    ts::end(scenario);
}

// ── seal_policy ──────────────────────────────────

#[test]
fun owner_can_decrypt() {
    let mut scenario = ts::begin(OWNER);
    seal_policy::create(scenario.ctx());

    scenario.next_tx(OWNER);
    let policy = scenario.take_shared<FormPolicy>();
    let id_bytes = object::id(&policy).to_bytes();
    seal_policy::test_seal_approve(id_bytes, &policy, scenario.ctx());
    ts::return_shared(policy);
    ts::end(scenario);
}

#[test]
#[expected_failure(abort_code = scrolls::seal_policy::ENoAccess)]
fun stranger_cannot_decrypt() {
    let mut scenario = ts::begin(OWNER);
    seal_policy::create(scenario.ctx());

    scenario.next_tx(STRANGER);
    let policy = scenario.take_shared<FormPolicy>();
    let id_bytes = object::id(&policy).to_bytes();
    seal_policy::test_seal_approve(id_bytes, &policy, scenario.ctx());
    ts::return_shared(policy);
    ts::end(scenario);
}

#[test]
fun added_admin_can_decrypt() {
    let mut scenario = ts::begin(OWNER);
    seal_policy::create(scenario.ctx());

    scenario.next_tx(OWNER);
    let mut policy = scenario.take_shared<FormPolicy>();
    seal_policy::add_admin(&mut policy, ADMIN, scenario.ctx());
    ts::return_shared(policy);

    scenario.next_tx(ADMIN);
    let policy = scenario.take_shared<FormPolicy>();
    let id_bytes = object::id(&policy).to_bytes();
    seal_policy::test_seal_approve(id_bytes, &policy, scenario.ctx());
    ts::return_shared(policy);
    ts::end(scenario);
}

#[test]
#[expected_failure(abort_code = scrolls::seal_policy::ENoAccess)]
fun removed_admin_cannot_decrypt() {
    let mut scenario = ts::begin(OWNER);
    seal_policy::create(scenario.ctx());

    scenario.next_tx(OWNER);
    let mut policy = scenario.take_shared<FormPolicy>();
    seal_policy::add_admin(&mut policy, ADMIN, scenario.ctx());
    seal_policy::remove_admin(&mut policy, ADMIN, scenario.ctx());
    ts::return_shared(policy);

    scenario.next_tx(ADMIN);
    let policy = scenario.take_shared<FormPolicy>();
    let id_bytes = object::id(&policy).to_bytes();
    seal_policy::test_seal_approve(id_bytes, &policy, scenario.ctx());
    ts::return_shared(policy);
    ts::end(scenario);
}

#[test]
#[expected_failure(abort_code = scrolls::seal_policy::EIdMismatch)]
fun wrong_identity_aborts() {
    let mut scenario = ts::begin(OWNER);
    seal_policy::create(scenario.ctx());

    scenario.next_tx(OWNER);
    let policy = scenario.take_shared<FormPolicy>();
    seal_policy::test_seal_approve(b"wrong-id", &policy, scenario.ctx());
    ts::return_shared(policy);
    ts::end(scenario);
}
