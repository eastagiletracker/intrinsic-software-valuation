# **ISV Engine: Gap Analyzer (Calculation Engine)**

## **1\. Classification and Purpose**

The Gap Analyzer represents the second stage of the automated Intrinsic Software Value (ISV) metrology. It receives the output from the **Fact Finder** (system\_context.json) as well as the metadata from a **Jira Ticket** (Title, Description, Acceptance Criteria).

**Primary Objectives:**

* **Perform a Semantic Comparison ("Similarity Check"):** Are the requested capabilities already established within the system context?  
* **Identify Structural Distance ("Gap"):** Analyze the requirements across four dimensions: Data, UI, Logic, and Integration.  
* **Derive ISV Factors:** Determine scores for A1, A2, B1, and C1 according to the ISV Catalog V3.0.  
* **Generate Actionable Output:** Create a concrete, machine-readable To-Do list (Architecture Extensions / "Things to be done").

## ---

**2\. The Analysis Prompt (System Prompt)**

This prompt controls the AI agent performing the gap analysis.

### **Role & Context**

You are a Principal Software Architect and an expert in effort estimation and system design. You have two sources of information available:

* **system\_context.json:** The Digital Twin / current state of the existing codebase (Domain Models, Adapters, UI Patterns).  
* **ticket.json:** A new requirement (Target State).

### **Your Task**

Perform a rigorous gap analysis. Compare the ticket requirements with the existing capabilities of the system. Answer the core question: **Can this requirement be solved using existing patterns and integrations, or must new architectural bridges be built?**

### **Analysis Instructions**

* **Ticket Quality Check:** First, verify if the ticket is sufficiently described to perform an architectural analysis.  
* **Architectural Fit:** Assess whether the existing architectural design (patterns) is sufficient or if architectural extensions are necessary.  
* **Gap Identification:** Examine four dimensions:  
  * **Data Gap:** Are entities (domainModels) missing? Does the database schema need to be extended?  
  * **UI/UX Gap:** Does it require custom UI that goes beyond established frontend patterns?  
  * **Logic Gap:** Is it pure CRUD (Pass-Through) or are complex new algorithms/business rules required?  
  * **Integration Gap:** Do we need connections to third-party systems that do not yet exist in the adapterCatalog?

### **ISV Scoring (Version 3.0)**

Evaluate complexity strictly according to the following keys:

* **A1 (Data):** 1.0 (Read-Only/Static) | 3.0 (Single Entity Change) | 6.0 (Multi-Entity/Transactional)  
* **A2 (UX):** 1.0 (Standard UI/None) | 1.5 (Advanced UI) | 3.0 (Rich Interaction/Complex State)  
* **B1 (Logic):** 1.0 (Pass-Through/CRUD) | 3.0 (Conditional/Status) | 8.0 (Algorithmic/Heavy)  
* **C1 (Integration):** 1.0 (Local/Greenfield) | 1.5 (Extension of existing APIs) | 3.0 (Core Refactoring) | 5.0 (New Third-Party System / "Infra Beast")

### **Actionable Output**

Create a precise, bulleted To-Do list of the absolutely necessary technical steps.

## ---

**3\. Output Format (JSON Schema)**

To save results directly in the Jira ticket (e.g., as calculated fields and formatted comments), the following exact JSON schema is enforced:

TypeScript

interface GapAnalysisResult {  
  ticketId: string;  
  // 0\. Meta & Quality Gate  
  meta: {  
    isTicketActionable: boolean; // false if ticket only says "Fix Button"  
    reasonIfNotActionable?: string; // Reason why it must go back to refinement  
    confidenceScore: number; // 0.0 to 1.0. AI certainty level  
  };  
  // 1\. Basic Architectural Statement  
  architecturalFit: {  
    canBeImplementedWithExistingPatterns: boolean;  
    summary: string; // e.g., "Requires new middleware integration, otherwise standard frontend."  
  };  
  // 2\. Identified Gaps  
  identifiedGaps: {  
    data: {  
      hasGap: boolean;  
      missingEntities: string\[\]; // e.g., \["Subscription", "Invoice"\]  
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
      missingAdapters: string\[\]; // e.g., \["Salesforce API"\]  
      description: string;  
    };  
  };  
  // 3\. Concrete To-Dos & Extensions  
  requiredModifications: {  
    architectureExtensions: string\[\]; // Large interventions (e.g., "Implement OAuth2 Flow")  
    actionItems: string\[\]; // Concrete dev tasks (e.g., "Create DB Migration for Table X")  
  };  
  // 4\. ISV Scoring based on V3.0 Catalog  
  isvScoring: {  
    A1\_Data: { score: 1.0 | 3.0 | 6.0; reasoning: string };  
    A2\_UX: { score: 1.0 | 1.5 | 3.0; reasoning: string };  
    B1\_Logic: { score: 1.0 | 3.0 | 8.0; reasoning: string };  
    C1\_Integration: { score: 1.0 | 1.5 | 3.0 | 5.0; reasoning: string };  
  };  
}

## ---

**4\. LLM Configuration & Operations**

To guarantee reproducible results, the API call must be configured as follows:

* **Model Selection:** A model with strong reasoning capabilities and perfect JSON compliance (e.g., GPT-4o, Claude 3.5 Sonnet).  
* **Temperature:** 0.0 or 0.1. We want hard, deterministic factual analysis, not creative solutions.  
* **Structured Outputs:** The API must be called with a mandatory JSON schema response format.  
* **Fallback Logic (Quality Gate):** If meta.isTicketActionable \=== false, the pipeline aborts. The Jira ticket is automatically set to "Needs Refinement" with a comment containing the reason.  
* **Manual Review (Confidence):** If meta.confidenceScore \< 0.7, the ticket is calculated but receives an ISV-Review-Needed label in Jira.

## ---

**5\. Example Output (Scenario: New Salesforce Integration)**

**Ticket:** "Push leads from contact form into new Salesforce CRM."

**Status Quo:** Fact Finder reports only an internal database exists (no Salesforce adapter).

JSON

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
      "missingEntities": \[\],  
      "description": "The 'Lead' entity already exists in the Domain Model."  
    },  
    "ui": {  
      "hasGap": false,  
      "description": "Standard contact form is sufficient; no complex UI extensions needed."  
    },  
    "logic": {  
      "hasGap": true,  
      "description": "Mapping logic from internal lead format to the Salesforce data model must be implemented, including error handling."  
    },  
    "integration": {  
      "hasGap": true,  
      "missingAdapters": \["Salesforce API"\],  
      "description": "Completely new connection to an external third-party system required."  
    }  
  },  
  "requiredModifications": {  
    "architectureExtensions": \[  
      "Introduction of an Outbound Adapter / HTTP Client for Salesforce",  
      "Implementation of a retry mechanism for API failures"  
    \],  
    "actionItems": \[  
      "Securely store Salesforce API credentials in Secrets Manager",  
      "Map Lead DTO to Salesforce model",  
      "Implement POST request in backend service",  
      "Adjust success/error messages in the frontend form"  
    \]  
  },  
  "isvScoring": {  
    "A1\_Data": {  
      "score": 3.0,  
      "reasoning": "Processing of a single entity (Lead)."  
    },  
    "A2\_UX": {  
      "score": 1.0,  
      "reasoning": "Standard form UI, no rich interaction."  
    },  
    "B1\_Logic": {  
      "score": 3.0,  
      "reasoning": "Data mapping and conditional logic (API error handling)."  
    },  
    "C1\_Integration": {  
      "score": 5.0,  
      "reasoning": "Integration of a new, previously unknown third-party system (Infra Beast)."  
    }  
  }  
}

