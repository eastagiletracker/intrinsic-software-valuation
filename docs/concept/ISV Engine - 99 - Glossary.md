# **ISV glossary**

This glossary provides an alphabetical overview of the terms and components used in the **Intrinsic Software Value (ISV) Engine**.

* **A1 (Data Value):** A factor that measures how much the software change affects database structures, entities, or data models.  
* **A2 (UX Multiplier):** A factor that adjusts the value based on the complexity of the user interface, ranging from "no UI" to highly interactive custom screens.  
* **B1 (Logic Value):** A factor representing the complexity of the internal calculations, business rules, and algorithms required for a task.  
* **C1 (Integration Factor):** A factor that measures the difficulty of connecting a change to external systems, third-party APIs, or new infrastructure.  
* **C2 (State Factor):** Often called the "friction" score, this measures technical debt. If the existing code is messy or complex, this factor increases the ISV to reflect the added difficulty.  
* **Calibration:** The process of analyzing historical data to determine the relationship between abstract ISV points and the actual time spent on development.  
* **Confidence Score:** A percentage showing how certain the AI is about its analysis of a requirement. Low scores indicate that a ticket may need more detail.  
* **D3 (Quality Multiplier):** An optional factor that increases the ISV score if a task requires extra-high quality standards, such as intensive security audits or mandatory automated testing.  
* **Digital Twin:** A machine-readable map of the current software architecture. It serves as the baseline for identifying what already exists and what needs to be built.  
* **Fact Finder:** An automated scanner (also called the **Status Quo Miner**) that examines the current source code to create the Digital Twin.  
* **Gap Analyzer:** An AI-driven component that compares a new requirement (like a Jira ticket) against the Digital Twin to identify exactly what structural changes are needed.  
* **Intrinsic Software Value (ISV):** An objective, dimensionless number that represents the structural size and complexity of a software requirement.  
* **Knowledge-Based Value (KBV):** Time tracked on activities that do not result in direct code changes, such as meetings, administration, or general research.  
* **Ship Rate:** The empirical conversion rate used to translate abstract ISV points into real-world hours or costs.  
* **Ship Unit Cluster:** A logical grouping of related tasks (such as a Story and its Subtasks) that are evaluated together as one complete feature.  
* **system\_context.json:** The specific file produced by the Fact Finder that contains the machine-readable description of the current system’s capabilities and patterns.  
* **Valuation Engine:** The component that applies a mathematical calculation to the identified gaps to produce the final ISV score.  
* **Value Metrology:** The overall philosophy of the engine, which focuses on measuring the structural value of software rather than relying on subjective time estimates.