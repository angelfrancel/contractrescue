# AGENTS.md

This file provides guidance to agents when working with code in this repository.

## Documentation context

- `docs/api-contract.md` is one source of contract evidence, alongside frontend consumer behavior, backend provider behavior, schemas, and tests.
- Documentation must not be treated as automatically authoritative when the available sources disagree.
- During investigation, report each source's observed expectation independently and cite the relevant file, heading, symbol, or test.
- Do not silently resolve contradictions. A recommended resolution must remain pending until the developer explicitly approves it through the ContractRescue workflow.
- `frontend/src/api/` currently contains only the frontend API-consumer module. A complete dashboard will be added separately later.
- The existing baseline contract test is expected to fail. Its failure demonstrates the current incompatibility and must not be described as an accidental regression.
- Unit tests pass on the baseline by design because they encode isolated frontend and backend assumptions.