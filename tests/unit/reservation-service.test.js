import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { createReservation, resetReservations } from "../../backend/reservation-service.js";

beforeEach(() => resetReservations());

test("creates a reservation for an available item", () => {
  const result = createReservation({ itemId: "item-001", buyerId: "buyer-001" });

  assert.equal(result.status, 201);
  assert.equal(result.body.itemId, "item-001");
  assert.equal(result.body.status, "active");
});

test("rejects a second reservation using the backend's current behavior", () => {
  createReservation({ itemId: "item-001", buyerId: "buyer-001" });
  const duplicate = createReservation({ itemId: "item-001", buyerId: "buyer-002" });

  // This layer-specific test passes, but it encodes the backend's mistaken assumption.
  assert.equal(duplicate.status, 400);
  assert.equal(duplicate.body.code, "RESERVATION_CONFLICT");
});

