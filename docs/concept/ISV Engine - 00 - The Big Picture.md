# **ISV Engine: The Big Picture**

## **1\. Executive Summary: What is the ISV Engine?**

The **ISV Engine** is a fully automated architecture and valuation process. It replaces error-prone, subjective effort estimations in software development with **Value Metrology**: the calculation of an objective, deterministic value known as the **Intrinsic Software Value (ISV)**.

Instead of asking humans "How long will this take?", the engine asks the code base and an AI: "How large is the structural gap between what the system can do today and what the new ticket requires?". The result is a dimensionless metric (the ISV) that reflects the true architectural complexity and risk of a requirement.

## ---

**2\. The End-to-End Workflow**

The engine operates as an invisible pipeline (e.g., in GitHub Actions or GitLab CI) and integrates directly into the agile process via Jira.

* **Trigger:** A Product Owner sets a Jira ticket to the status "Ready for Refinement".

* **Phase 1 (Fact Finder):** A script scans the repositories and determines the exact, objective current state of the architecture.

* **Phase 2 (Gap Analyzer):** An AI agent compares the Jira ticket with the current state and identifies the architectural delta.

* **Phase 3 (Valuation Engine):** A deterministic script converts the delta into the final ISV score based on a fixed formula.

* **Result:** The Jira ticket is automatically updated (e.g., Custom Field ISV: 45.0) and provided with a comment transparently listing the technical gaps and risks.

## ---

**3\. The Three Phases in Detail**

### **Phase 1: The Fact Finder (The Digital Twin)**

* **Objective:** Capturing the baseline (Status Quo).

* **Functionality:** Data is not interpreted; it is strictly counted. The pipeline checks out the current code and generates two items:

  1. **system\_context.json:** A machine-readable map of the architecture, including existing frontend patterns, database entities, and external adapters.

  2. **Health Metrics:** Objective metrics regarding code quality, test coverage, and "god classes". These are used to calculate the **State Factor (C2)** (e.g., 1.0 for clean code, 3.0 for toxic legacy code).

### **Phase 2: The Gap Analyzer (The AI Bridge)**

* **Objective:** Determining the delta between the target state (ticket) and the current state (code).

* **Functionality:** A Large Language Model (e.g., GPT-4o) reads the Jira ticket and the system\_context.json, acting as a virtual system architect.

* **The Measuring Tape:** The AI uses the formal **ISV Questionnaire (V3.3)** as a strict set of rules. It does not evaluate the ticket in isolation but focuses exclusively on the **gap**: Does a new database schema need to be built? Is an API adapter missing?.

* **Output:** A strictly typed JSON object containing the identified V3.3 values (A1, A2, B1, C1) and a precise to-do list of architectural extensions.

### **Phase 3: The Valuation Engine (The Calculator)**

* **Objective:** Mathematical calculation of the final value.

* **Functionality:** A pure code script (without AI) takes the values from Phase 1 and Phase 2 to calculate the score.

* **The Core Formula:**

  $$ISV \= ((A1 \\times A2) \+ B1) \\times (C1 \\times C2) \\times D3$$

* **((A1 \* A2) \+ B1):** The functional value (data volume, UI depth, logic).

* **(C1 \* C2):** The architectural leverage and systemic risk.

This formula makes technical debt (Tech Debt) commercially visible. If a developer must perform a deep intervention (C1) in an outdated, untested system (C2), the ISV score explodes, directly "punishing" a lack of refactoring within the pricing model.

## ---

**4\. The Paradigm Shift (Summary)**

This engine fundamentally changes the collaboration between Product Management and Development:

* **No Manual Catalogues:** Product Owners no longer need to fill out questionnaires.

* **Focus on the Delta:** The engine understands that building a "login" in a system with an existing identity provider has a low ISV (e.g., 4.0), whereas in an empty system, it would be much higher (e.g., 45.0).

* **Plausibility in Refinement:** Developers no longer spend hours estimating. They simply verify the Gap Analyzer's output to ensure the architectural gaps were correctly identified. If correct, the ISV is immediately valid.

* **Quality Gates:** If a ticket is too vague, the AI aborts Phase 2 with a low **Confidence Score** and automatically sends the ticket back for refinement, preventing "Garbage In, Garbage Out".

## ---

**5\. Outlook: The Price Tag**

The ISV Engine provides the exact **structural size** of a feature. To derive budgets, prices, or capacity planning, a historical **Calibration** is performed. By mining past Jira tickets and time tracking data, the engine determines the **Ship Rate**: how many hours or Euros an "ISV point" has historically cost within the specific context of the company.

Would you like me to generate a summary table of the different ISV factors (A1, B1, C1, etc.) and their specific definitions?