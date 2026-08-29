import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DUPLICATE_RESERVATION_STATUS,
  interpretReservationResponse
} from "../../frontend/src/api/reservations.js";

test("frontend treats HTTP 409 as a reservation conflict", () => {
  assert.equal(DUPLICATE_RESERVATION_STATUS, 409);
  assert.equal(interpretReservationResponse(409).outcome, "conflict");
});

test("frontend cannot interpret the backend's duplicate status", () => {
  assert.equal(interpretReservationResponse(400).outcome, "unexpected_error");
});

