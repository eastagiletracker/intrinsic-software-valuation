# ISV Engine: Gap Analyzer (Calculation Engine)

## Purpose and Context

The Gap Analyzer is phase 2 of automated Intrinsic Software Value (ISV) metrology. It receives `system_context.json` from the Fact Finder and metadata from a Jira ticket (title, description, acceptance criteria).

Primary objectives:

- Perform a semantic comparison (similarity check): Are requested capabilities already established?
- Identify structural distance (gap): Analyze requirements across data, UI, logic, and integration.
- Derive ISV factors: Determine values for `A1`, `A2`, `B1`, and `C1` according to the ISV catalog.
- Generate actionable output: Produce a machine-readable list of required architecture extensions and tasks.

## Analysis Prompt (System Prompt)

This prompt controls the AI agent performing the gap analysis.

### Role and Context

You are a Principal Software Architect and expert in effort estimation and system design.

Available inputs:

- `system_context.json`: Current state of the codebase (domain models, adapters, UI patterns).
- `ticket.json`: New requirement (target state).

### Task

Perform a rigorous gap analysis by comparing the ticket with existing capabilities. Answer whether the requirement can be solved with existing patterns and integrations or needs new architectural bridges.

### Analysis Instructions

- Ticket quality check: Verify whether the ticket is sufficiently described for architectural analysis.
- Architectural fit: Assess whether existing architecture patterns are sufficient.
- Gap identification across four dimensions:
  - Data gap: Missing entities or schema extensions?
  - UI/UX gap: Custom UI beyond established frontend patterns?
  - Logic gap: Pass-through CRUD or complex new business logic?
  - Integration gap: New third-party connections missing from `adapterCatalog`?

### ISV Scoring (Version 3.0)

Evaluate complexity strictly by these keys:

- `A1` (Data): `1.0` (Read-only/static) | `3.0` (Single entity change) | `6.0` (Multi-entity/transactional)
- `A2` (UX): `1.0` (Standard UI/none) | `1.5` (Advanced UI) | `3.0` (Rich interaction/complex state)
- `B1` (Logic): `1.0` (Pass-through/CRUD) | `3.0` (Conditional/status) | `8.0` (Algorithmic/heavy)
- `C1` (Integration): `1.0` (Local/greenfield) | `1.5` (Extension of existing APIs) | `3.0` (Core refactoring) | `5.0` (New third-party system)

### Actionable Output

Create a precise list of required technical steps.

## Output Format (JSON Schema)

Use this exact JSON structure so results can be persisted into Jira fields and comments.

```typescript
interface GapAnalysisResult {
  ticketId: string;
  meta: {
    isTicketActionable: boolean;
    reasonIfNotActionable?: string;
    confidenceScore: number;
  };
  architecturalFit: {
    canBeImplementedWithExistingPatterns: boolean;
    summary: string;
  };
  identifiedGaps: {
    data: {
      hasGap: boolean;
      missingEntities: string[];
      description: string;
    };
    ui: {
      hasGap: boolean;
      description: string;
    };
    logic: {
      hasGap: boolean;
      description: string;
    };
    integration: {
      hasGap: boolean;
      missingAdapters: string[];
      description: string;
    };
  };
  requiredModifications: {
    architectureExtensions: string[];
    actionItems: string[];
  };
  isvScoring: {
    A1_Data: { score: 1.0 | 3.0 | 6.0; reasoning: string };
    A2_UX: { score: 1.0 | 1.5 | 3.0; reasoning: string };
    B1_Logic: { score: 1.0 | 3.0 | 8.0; reasoning: string };
    C1_Integration: { score: 1.0 | 1.5 | 3.0 | 5.0; reasoning: string };
  };
}
```

## LLM Configuration and Operations

To improve reproducibility:

- Model selection: Use a strong reasoning model with robust JSON compliance.
- Temperature: `0.0` or `0.1` for deterministic analysis.
- Structured outputs: Enforce mandatory JSON schema response format.
- Fallback quality gate: If `meta.isTicketActionable === false`, abort the pipeline and return ticket to refinement with reason.
- Manual review threshold: If `meta.confidenceScore < 0.7`, calculate ISV but label for review.

## Example Output (Scenario: New Salesforce Integration)

Ticket:

Push leads from contact form into new Salesforce CRM.

Status quo:

Fact Finder reports only an internal database and no Salesforce adapter.

```json
{
  "ticketId": "PROJ-842",
  "meta": {
    "isTicketActionable": true,
    "confidenceScore": 0.95
  },
  "architecturalFit": {
    "canBeImplementedWithExistingPatterns": false,
    "summary": "The frontend pattern for forms exists, but an outbound adapter for Salesforce is missing. The architecture must be extended with an external API integration."
  },
  "identifiedGaps": {
    "data": {
      "hasGap": false,
      "missingEntities": [],
      "description": "The 'Lead' entity already exists in the domain model."
    },
    "ui": {
      "hasGap": false,
      "description": "Standard contact form is sufficient; no complex UI extension needed."
    },
    "logic": {
      "hasGap": true,
      "description": "Mapping logic from internal lead format to the Salesforce model must be implemented, including error handling."
    },
    "integration": {
      "hasGap": true,
      "missingAdapters": ["Salesforce API"],
      "description": "A new outbound third-party integration is required."
    }
  },
  "requiredModifications": {
    "architectureExtensions": [
      "Introduce an outbound adapter or HTTP client for Salesforce",
      "Implement retry handling for API failures"
    ],
    "actionItems": [
      "Store Salesforce credentials securely",
      "Map internal lead DTO to Salesforce model",
      "Implement backend POST request",
      "Adjust frontend success and error messages"
    ]
  },
  "isvScoring": {
    "A1_Data": {
      "score": 3.0,
      "reasoning": "Single entity processing (Lead)."
    },
    "A2_UX": {
      "score": 1.0,
      "reasoning": "Standard form UI without rich interaction."
    },
    "B1_Logic": {
      "score": 3.0,
      "reasoning": "Conditional mapping and error handling logic."
    },
    "C1_Integration": {
      "score": 5.0,
      "reasoning": "Integration of a new third-party system."
    }
  }
}
```