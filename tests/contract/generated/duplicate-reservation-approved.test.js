import { readFileSync } from "node:fs";
import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";

import {
  createReservation,
  resetReservations
} from "../../../backend/reservation-service.js";

import {
  interpretReservationResponse
} from "../../../frontend/src/api/reservations.js";

// Read the approved decision at runtime.
const decision = JSON.parse(
  readFileSync(new URL("../../../artifacts/approved-decision.json", import.meta.url), "utf8")
);

const ANALYSIS_ID     = decision.analysisId;                  // "CR-001"
const DECISION_ID     = decision.decisionId;                  // "CR-001-DECISION-001"
const EXPECTED_STATUS = decision.approvedContract.statusCode; // 409

describe(
  `ContractRescue RED phase | analysisId=${ANALYSIS_ID} | decisionId=${DECISION_ID}`,
  () => {
    beforeEach(() => {
      resetReservations();
    });

    it(
      `POST /api/reservations duplicate reservation must return HTTP ${EXPECTED_STATUS} ` +
      `[${ANALYSIS_ID} / ${DECISION_ID}]`,
      () => {
        // Step 1: create the first reservation successfully.
        const first = createReservation({ itemId: "item-cr001", buyerId: "buyer-a" });
        assert.equal(first.status, 201, "First reservation should succeed with 201");

        // Step 2: attempt a duplicate reservation for the same item.
        const duplicate = createReservation({ itemId: "item-cr001", buyerId: "buyer-b" });

        // Step 3: provider's duplicate status must equal the approved contract status (409).
        assert.equal(
          duplicate.status,
          EXPECTED_STATUS,
          `Expected provider to return HTTP ${EXPECTED_STATUS} for a duplicate reservation ` +
          `(approved by ${decision.approvedBy} at ${decision.approvedAt}), ` +
          `but received ${duplicate.status}. ` +
          `Analysis: ${ANALYSIS_ID}, Decision: ${DECISION_ID}.`
        );

        // Step 4: error code must be RESERVATION_CONFLICT.
        assert.equal(
          duplicate.body.code,
          "RESERVATION_CONFLICT",
          `Expected body.code === 'RESERVATION_CONFLICT', got '${duplicate.body.code}'`
        );

        // Step 5: frontend must interpret the provider's actual status as 'conflict'.
        const interpretation = interpretReservationResponse(duplicate.status);
        assert.equal(
          interpretation.outcome,
          "conflict",
          `Frontend interpreted status ${duplicate.status} as '${interpretation.outcome}', expected 'conflict'. ` +
          `Analysis: ${ANALYSIS_ID}, Decision: ${DECISION_ID}.`
        );
      }
    );
  }
);
