# ISV Engine: Gap Analyzer (Calculation Engine)

## Purpose and Context

The Gap Analyzer is phase 2 of automated Intrinsic Software Value (ISV) metrology. It receives `system_context.json` from the Fact Finder and metadata from a Jira ticket (title, description, acceptance criteria).

Primary objectives:

- Perform a semantic comparison (similarity check): Are requested capabilities already established?
- Identify structural distance (gap): Analyze requirements across data, UI, logic, and integration.
- Derive ISV factors: Determine values for `A1`, `A2`, `B1`, `C1`, and `D3` according to the ISV catalog.
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

### ISV Scoring (Version 3.4)

Evaluate complexity using the **Fibonacci integer scale**. Use exactly the discrete values listed — no fractions, no interpolation.

- `A1` (Data): `1` (Read-only / display only) | `2` (Single entity create or edit) | `3` (Multi-entity or relations) | `5` (Schema expansion, migrations, complex transactions)
- `A2` (UX): `1` (Headless / no UI — neutral) | `2` (Standard component integration) | `3` (Custom UI with complex client-side state)
- `B1` (Logic): `0` (Pass-through / routing) | `1` (Simple transform) | `2` (Validation / conditional logic) | `3` (State machines / workflows) | `5` (Complex algorithms) | `8` (Heavy computation or AI)
- `C1` (Integration): `1` (Local change, no new adapters) | `2` (Extension of existing adapters or APIs) | `3` (Core refactoring or new internal adapter) | `5` (New third-party system or major infrastructure)
- `D3` (Quality): `1` (Standard Definition of Done — default) | `2` (Elevated: mandatory E2E tests, WCAG AAA, security audit) | `3` (Regulatory or compliance constraints)

`D3` defaults to `1` unless the ticket explicitly signals elevated quality requirements (compliance language, WCAG AAA, mandatory certification). A project-level configuration may also provide a baseline `D3` that the agent uses as the floor.

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
    A1_Data: { score: 1 | 2 | 3 | 5; reasoning: string };
    A2_UX: { score: 1 | 2 | 3; reasoning: string };
    B1_Logic: { score: 0 | 1 | 2 | 3 | 5 | 8; reasoning: string };
    C1_Integration: { score: 1 | 2 | 3 | 5; reasoning: string };
    D3_Quality: { score: 1 | 2 | 3; reasoning: string };
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
      "score": 2,
      "reasoning": "Single entity create (Lead). No schema expansion required."
    },
    "A2_UX": {
      "score": 1,
      "reasoning": "Standard contact form; no custom UI state needed."
    },
    "B1_Logic": {
      "score": 3,
      "reasoning": "Conditional mapping and error handling logic — comparable to a workflow."
    },
    "C1_Integration": {
      "score": 5,
      "reasoning": "Integration of a new third-party system (Salesforce)."
    },
    "D3_Quality": {
      "score": 1,
      "reasoning": "Standard Definition of Done; no elevated compliance requirements detected in ticket."
    }
  }
}
```
