import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { createReservation, resetReservations } from "../../backend/reservation-service.js";
import {
  DUPLICATE_RESERVATION_STATUS,
  interpretReservationResponse
} from "../../frontend/src/api/reservations.js";

beforeEach(() => resetReservations());

test("provider and consumer agree on duplicate reservation behavior", () => {
  createReservation({ itemId: "item-001", buyerId: "buyer-001" });
  const providerResponse = createReservation({
    itemId: "item-001",
    buyerId: "buyer-002"
  });

  assert.equal(
    providerResponse.status,
    DUPLICATE_RESERVATION_STATUS,
    "Contract mismatch: provider must return the duplicate status expected by the consumer"
  );
  assert.equal(interpretReservationResponse(providerResponse.status).outcome, "conflict");
});

