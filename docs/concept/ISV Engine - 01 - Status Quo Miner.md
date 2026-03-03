# **ISV Engine: Status Quo Miner (Fact Finder)**

## **Function**

The creation of a "Digital Twin" of the current codebase across system boundaries.

## **Principle**

Deterministic data collection. No interpretation, only counting. Extremely robust for large-scale historical analyses.

## ---

**Input & Time-Travel Checkout**

To determine a historical baseline **before** the start of a ticket's development, the Fact Finder travels back in time.

* **Target Repositories:** A list of $n$ Git repositories (e.g., frontend-app, backend-service-java).  
* **Target Timestamp:** An exact point in time (ISO 8601), typically the creation date of the Jira ticket.  
* **Checkout Logic:** The Fact Finder searches all $n$ repositories for the last commit **before** the timestamp and checks it out.

## ---

**Data to be Collected (The "Big 5" Set)**

The metrics are divided into two easy-to-understand dimensions: Neutral Facts (Size/Topology) and Health Scores (Risk/Debt).

### **Category 1: Structural Facts (Size & Activity)**

These metrics neutrally describe how large the system is and where the most activity is currently taking place.

* **Volume (Code Size):**  
  * **Metric:** Total Lines of Code (LoC) & absolute number of files.  
  * **Tool:** scc or cloc.  
* **Architecture Entry Points (Proxy for System Surface):**  
  * **Metric:** Number of defined functional entry points of the system.  
  * **Note:** This metric is highly stable and scales perfectly for historical runs as it does not rely on dynamic parsing.  
  * **Backend:** Counting controllers/resolvers (e.g., files ending in \*Controller.java or \*Resolver.java).  
  * **Frontend:** Counting main views (e.g., files in specific folders like /pages, /views or with extensions like \*Page.tsx / \*Screen.tsx).  
  * **Tool:** Standard file system search (find, fd) or pattern recognition in file lists.  
* **Git Hotspots (The "Danger Zone"):**  
  * **Metric:** List of the 50 most frequently changed files in the last 12 months.  
  * **Note:** Shows the AI where the "nervous" core components are located.  
  * **Tool:** git log \--format=format: \--name-only | sort | uniq \-c | sort \-nr | head \-50

### **Category 2: Health Scores (Risk & Technical Debt)**

These metrics indicate how "healthy" the codebase is. They correlate extremely strongly with integration effort and significantly determine the "Legacy Factor" (C2).

* **Complexity, Duplication & God Classes:**  
  * **Metric:** Average cyclomatic complexity, copy-paste percentage (%), and the absolute number of files with \> 1,000 lines ("God Classes").  
  * **Tool:** scc (Complexity & God Classes) \+ jscpd (Duplication Score).  
* **Test Health & System Rot:**  
  * **Metric:** Unit Test Code Coverage (%) combined with the number of outdated/vulnerable NPM/Maven packages and dead code (Dead Code/Unused Exports).  
  * **Tool:** JaCoCo/Jest (Coverage) \+ Knip (Dead Code JS/TS) \+ npm outdated \--json / mvn versions:display-dependency-updates (Rot).

## ---

**Output**

**system\_context\_{timestamp}.json**

An aggregated JSON report divided into structural\_facts and health\_scores.