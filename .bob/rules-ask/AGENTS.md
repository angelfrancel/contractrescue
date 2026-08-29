# AGENTS.md

This file provides guidance to agents when working with code in this repository.

## Documentation context

- Source-scope paths (documentation, provider, consumer, tests) come from the selected validated config (`contractrescue.json` by default). Prefer config-declared paths when describing source scope.
- Documentation must not be treated as automatically authoritative when the available sources disagree.
- During investigation, report each source's observed expectation independently and cite the relevant file, heading, symbol, or test.
- Do not silently resolve contradictions. A recommended resolution must remain pending until the developer explicitly approves it through the ContractRescue workflow.
- CR-001 is complete. Duplicate reservations correctly return HTTP 409, all current tests pass, and historical CR-001 artifacts are immutable.
