# Architecture Scanner Test Fixtures

Synthetic repository structures for testing the architecture scanner's
deep sampling strategy.

## `sample-repo/`

A mock Java + TypeScript project with:

- **Domain entities**: `OrderEntity.java`, `CustomerEntity.java`, `product.types.ts`
- **Adapters**: `StripePaymentClient.java`, `SendGridEmailAdapter.java`, `product.client.ts`
- **Entry points**: `OrderController.java`
- **Config files**: `pom.xml`, `frontend/package.json`
- **Noise directories**: `node_modules/`, `dist/`, `.git/` (should be excluded)

Provenance: All files are synthetic — not derived from any real project.
Created specifically for Tier 1 unit tests of the `sampleDirectory()` function.
