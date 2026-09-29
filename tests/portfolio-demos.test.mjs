import test from "node:test";
import assert from "node:assert/strict";
import {
  RADAR_LISTINGS, deduplicateListings, reviewListings, deliverReport,
  bookingState, eligibleTimes, selectTime, confirmBooking,
} from "../assets/js/portfolio-demos.mjs";

if (Number(process.versions.node.split(".")[0]) < 20) {
  throw new Error("Run these tests with Node.js 20 or newer, matching the website build environment.");
}

test("the same opportunity keeps both source names without mutating the inputs", () => {
  const before = JSON.stringify(RADAR_LISTINGS);
  const result = deduplicateListings(RADAR_LISTINGS);
  assert.equal(result.length, RADAR_LISTINGS.length - 1);
  assert.deepEqual(result.find(row => row.key === "strategy").sources, ["Campus board", "Company website"]);
  assert.equal(JSON.stringify(RADAR_LISTINGS), before);
});

test("an unavailable review retains every unique opportunity for manual review", () => {
  const unique = deduplicateListings(RADAR_LISTINGS);
  const reviewed = reviewListings(unique, true);
  assert.deepEqual(reviewed.map(row => row.key), unique.map(row => row.key));
  assert.ok(reviewed.every(row => row.decision === "review"));
  assert.ok(reviewListings(unique).some(row => row.decision === "outside"));
});

test("a failed report delivery cannot consume unseen opportunities", () => {
  const rows = reviewListings(deduplicateListings(RADAR_LISTINGS));
  const previous = ["already-delivered"];
  const failed = deliverReport(rows, previous, true);
  assert.equal(failed.delivered, false);
  assert.deepEqual(failed.seen, previous);
  const success = deliverReport(rows, failed.seen);
  assert.ok(success.delivered);
  assert.ok(success.seen.includes("unusual"));
  assert.ok(!success.seen.includes("retail"));
  assert.deepEqual(deliverReport(rows, success.seen).seen, success.seen);
  assert.deepEqual(previous, ["already-delivered"]);
});

test("weather, calendar conflicts and missing availability exclude times", () => {
  assert.deepEqual(eligibleTimes(bookingState("golf")).map(t => t.id), ["g1", "g4"]);
  assert.deepEqual(eligibleTimes(bookingState("haircut")).map(t => t.id), ["h1", "h4"]);
});

test("no booking can be confirmed without an eligible selected time", () => {
  const idle = bookingState("golf");
  assert.deepEqual(confirmBooking(idle), idle);
  assert.deepEqual(selectTime(idle, "g1"), idle);
  const choosing = { ...idle, status: "choosing" };
  assert.deepEqual(selectTime(choosing, "g2"), choosing);
  assert.deepEqual(selectTime(choosing, "missing"), choosing);
});

for (const kind of ["golf", "haircut"]) {
  test(kind + ": repeating confirmation never duplicates a booking", () => {
    const start = { ...bookingState(kind), status: "choosing" };
    const id = eligibleTimes(start)[0].id;
    const success = confirmBooking(selectTime(start, id));
    const repeated = confirmBooking(success);
    assert.equal(repeated.requests, 1);
    assert.deepEqual(repeated.bookings, [id]);
    assert.match(repeated.message, /ignored/);
  });

  test(kind + ": uncertainty blocks an automatic retry and never claims success", () => {
    const start = { ...bookingState(kind), status: "choosing" };
    const selected = selectTime(start, eligibleTimes(start)[0].id);
    const uncertain = confirmBooking(selected, "uncertain");
    assert.equal(uncertain.status, "uncertain");
    assert.deepEqual(uncertain.bookings, []);
    const retry = confirmBooking(uncertain, "normal");
    assert.equal(retry.requests, 1);
    assert.equal(retry.status, "uncertain");
    assert.deepEqual(retry.bookings, []);
    assert.match(retry.message, /blocked/);
  });

  test(kind + ": a taken time becomes unavailable and another choice can succeed", () => {
    const start = { ...bookingState(kind), status: "choosing" };
    const selectedId = eligibleTimes(start)[0].id;
    const taken = confirmBooking(selectTime(start, selectedId), "taken");
    assert.equal(taken.status, "unavailable");
    assert.equal(taken.selected, null);
    assert.ok(!eligibleTimes(taken).some(t => t.id === selectedId));
    assert.deepEqual(selectTime(taken, selectedId), taken);
    const next = confirmBooking(selectTime(taken, eligibleTimes(taken)[0].id));
    assert.equal(next.bookings.length, 1);
    assert.notEqual(next.bookings[0], selectedId);
  });
}
