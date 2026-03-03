# **ISV Engine: Valuation (Calculation Engine)**

## **1\. Classification and Purpose**

The **Valuation Engine** (Phase 3 of ISV automation) is the mathematical core of the value-based pricing model. It transforms identified architectural gaps (from the **Gap Analyzer**) and technical system metrics (from the **Fact Finder**) into a standardized, dimensionless value: the **Intrinsic Software Value (ISV)**.

This value represents the **structural size and complexity** of a requirement, free from subjective time estimates.

## ---

**2\. The Core Formula (Version 3.3)**

The calculation is logically divided into two blocks: the functional value (what is being built?) and the technical leverage (how difficult is the intervention in the existing architecture?).

**ISV \= ((A1 \* A2) \+ B1) \* (C1 \* C2) \* D3**

* **PO Value (Functional Value):** ((A1 \* A2) \+ B1)  
* **Arch Factor (Technical Leverage & Risk):** (C1 \* C2)  
* **Quality Multiplier:** D3

## ---

**3\. ISV Factors and Metrics**

### **3.1 Functional Value (Business / Feature Gravity)**

This part evaluates the content requirement of the ticket.

* **A1 (Data Value):** The architectural effort at the database and entity level.  
  * **1.0:** Entities are known, Read-Only, pure display.  
  * **3.0:** Editing/creating a single entity.  
  * **6.0:** Schema expansion (Data Modeling Change) or complex transactions required. *Note: Covers effort for migration scripts and rollback strategies.*  
* **A2 (UX Value \- Multiplier for Data):** Evaluates the depth of user interaction.  
  * **1.0:** Headless (No UI). Acts as a neutral factor: Data effort (A1) remains 1:1.  
  * **1.5:** Use of standard components. Creates a 50% leverage on A1 through frontend integration.  
  * **3.0:** System break (Custom UI required). Triples the weight of A1 due to complex state management in the client.  
* **B1 (Logic Value):** Algorithmic depth and data transformation.  
  * **0.0 to 8.0.**  
  * **Examples:** 0.0 (Pure pass-through/routing) to 3.0 (Conditional logic/validation) up to 8.0 (Heavy computation/AI).

### **3.2 Technical Leverage (Architecture & Legacy Friction)**

This part evaluates the risk and architectural intervention.

* **C1 (Integration Factor):** How deep is the cut into the architecture?  
  * **1.0:** Local (Isolated, no new adapters, intervention within the existing system).  
  * **4.0:** Deep Integration (Adapter missing, connection to a completely new external third-party system required).  
  * **5.0:** Infra Beast (Building massive new infrastructure components).  
* **C2 (State Factor / System Risk):** The "penalty factor" for technical debt, automatically determined by the Fact Finder.  
  * **1.0 to 3.0.**  
  * **Examples:** 1.0 (Clean code, good coverage), 2.0 (Moderate debt), 3.0 (Toxic, legacy code, God-classes).  
  * *Dangerous interventions in toxic systems multiply the final value.*

### **3.3 Quality Level**

* **D3 (Definition of Done):**  
  * Standard: **1.0**.  
  * Can be increased by architectural requirements (e.g., 1.3 for mandatory E2E tests or 2.0 for audit/compliance requirements).

## ---

**4\. Simulations and Case Studies**

To validate whether the calculation pipeline generates realistic value relationships, we simulate four typical development scenarios.

### **Scenario 1: The "React Component" Case (Frontend Heavy)**

New interactive calendar component in the frontend (Drag\&Drop). The backend only delivers existing data.

* **Values:** A1 (1.0), A2 (3.0 \- Custom UI), B1 (1.0), C1 (1.0), C2 (1.0), D3 (1.0)  
* **PO Value:** (1.0 \* 3.0) \+ 1.0 \= 4.0  
* **Arch Factor:** 1.0 \* 1.0 \= 1.0  
* **Total ISV \= 4.0**  
* **Observation:** A pure frontend feature without architectural interventions has a solid base value. The A2 \= 3.0 factor correctly weights the additional effort for complex custom UI.

### **Scenario 2: The "Salesforce Integration" (Integration Beast)**

Leads from a standard form are to be pushed into a new Salesforce CRM. Mapping logic required, adapter missing.

* **Values:** A1 (3.0), A2 (1.5 \- Standard UI), B1 (3.0 \- Mapping Logic), C1 (4.0 \- New Adapter), C2 (1.5 \- Moderate Debt), D3 (1.0)  
* **PO Value:** (3.0 \* 1.5) \+ 3.0 \= 7.5  
* **Arch Factor:** 4.0 \* 1.5 \= 6.0  
* **Total ISV \= 45.0**  
* **Observation:** The ISV explodes compared to Scenario 1 (\~11x factor). This is architecturally correct: connecting a new third-party system into a moderately maintained backend drives up systemic risk and the true structural value of the architecture.

### **Scenario 3: Headless Database Migration (Backend Heavy)**

A new feature requires deep schema expansions in the local database and a migration but has no UI (provided only via API).

* **Values:** A1 (6.0 \- Schema Expansion), A2 (1.0 \- Headless), B1 (3.0 \- Validation), C1 (1.0), C2 (1.0), D3 (1.0)  
* **PO Value:** (6.0 \* 1.0) \+ 3.0 \= 9.0  
* **Arch Factor:** 1.0 \* 1.0 \= 1.0  
* **Total ISV \= 9.0**  
* **Deep-Dive:** This honors the architectural effort for migration scripts and rollback strategies (A1=6.0). Since it happens in the existing local DB, C1 remains 1.0. If this were done in a fragile legacy system (C2=3.0), the ISV would triple to 27.0.

### **Scenario 4: The "Small Bugfix" in Toxic Legacy**

A minimal adjustment in the standard frontend (e.g., a new dropdown field) that is passed through. However, the code base (C2) is extremely outdated with God-classes and no tests.

* **Values:** A1 (1.0), A2 (1.5 \- Standard UI), B1 (0.0 \- Pass-Through), C1 (1.0), C2 (3.0 \- Toxic), D3 (1.0)  
* **PO Value:** (1.0 \* 1.5) \+ 0.0 \= 1.5  
* **Arch Factor:** 1.0 \* 3.0 \= 3.0  
* **Total ISV \= 4.5**  
* **Observation:** The technical debt "penalty" kicks in. A tiny functional change is calculated as being as expensive as a complex React component built from scratch. This forces Product Owners to prioritize architectural refactorings.