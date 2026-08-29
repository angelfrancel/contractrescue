// phase2c-provider-sample.js
// Deterministic, synchronous fixture module. No HTTP server, no database,
// no network access, no external dependencies. Used by Phase 2C capability test.

/**
 * Input shape:
 *   {
 *     itemId:   string  — required, non-empty identifier
 *     quantity: number  — required, integer >= 1
 *   }
 *
 * Possible outcomes:
 *   - 200  success          { code: "OK",               item: { id, quantity } }
 *   - 400  validation error { code: "INVALID_INPUT",    message: string }
 *   - 409  domain conflict  { code: "QUANTITY_CONFLICT", message: string }
 */
export function sampleOperation(input) {
  // Validation failure: missing or empty itemId
  if (!input || typeof input.itemId !== "string" || input.itemId.trim() === "") {
    return {
      status: 400,
      body: {
        code: "INVALID_INPUT",
        message: "itemId is required and must be a non-empty string.",
      },
    };
  }

  // Validation failure: quantity not a positive integer
  if (
    typeof input.quantity !== "number" ||
    !Number.isInteger(input.quantity) ||
    input.quantity < 1
  ) {
    return {
      status: 400,
      body: {
        code: "INVALID_INPUT",
        message: "quantity is required and must be an integer >= 1.",
      },
    };
  }

  // Domain-conflict result: quantity exceeds allowed ceiling
  if (input.quantity > 99) {
    return {
      status: 409,
      body: {
        code: "QUANTITY_CONFLICT",
        message: "Requested quantity exceeds the maximum allowed (99).",
      },
    };
  }

  // Successful result
  return {
    status: 200,
    body: {
      code: "OK",
      item: {
        id: input.itemId.trim(),
        quantity: input.quantity,
      },
    },
  };
}
