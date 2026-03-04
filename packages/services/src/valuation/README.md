# Valuation Service

## Purpose

Pure deterministic ISV formula engine. Takes six ISV factors and produces a scored result with full breakdown for auditing. No AI, no I/O, no side effects.

## Contents

| File | Description |
| --- | --- |
| `port.ts` | `ValuationPort` — service interface |
| `formula.ts` | ISV formula implementation (v3.4) |
| `c2-derivation.ts` | C2 State Factor derivation from health scores |
| `factory.ts` | `createValuationService()` factory |
| `index.ts` | Public re-exports |

## How to use

```typescript
import { createValuationService } from "@isv/services";

const valuation = createValuationService();

// Calculate ISV for a ticket
const result = valuation.calculate("PROJ-123", {
  A1_Data: 2,
  A2_UX: 2,
  B1_Logic: 3,
  C1_Integration: 5,
  C2_State: 2,
  D3_Quality: 1,
});
// result.isvScore === 70

// Derive C2 from health scores
const c2 = valuation.deriveC2(healthScores);

// Aggregate C2 across repos
const effectiveC2 = valuation.aggregateC2([1, 2, 3]); // → 3
```

## Formula (v3.4)

```
ISV = ((A1 × A2) + B1) × (C1 × C2) × D3
```

- PO value: `(A1 * A2) + B1`
- Architecture factor: `C1 * C2`
- Quality multiplier: `D3`
