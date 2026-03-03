# **ISV Engine: Historical Calibration**

## **1\. Executive Summary & Naming**

Once the ISV Engine calculates the structural complexity of a ticket as an abstract value (ISV), this value must be calibrated. This process is called **ISV Calibration**.

The goal is to determine the **"Ship Rate"**: a stable, empirically proven conversion rate between the abstract ISV unit and the actual time invested. The monetary valuation (in Euros) occurs in a second, decoupled step.

## ---

**2\. Input Data (Triangulation)**

For calibration, we utilize three data streams from the last 18 months:

### **A. Jira Ticket & Ticket Clustering (Target State)**

To evaluate a realistic "Ship Unit," the engine does not look at isolated individual tickets but instead forms **Ticket Clusters**:

* **Hierarchical Aggregation:** If a requirement consists of a Story/Task (Parent) and several subtasks, these are combined into a single logical unit.  
* **$T\_0$ Logic:** The technological starting point is determined via the Git First Commit (preferred) or a Jira status change.

### **B. Code at Time X (The Baseline)**

The **Fact Finder** performs a Git checkout to travel back to the exact baseline commit ($T\_0$) identified for the cluster.

### **C. Time Tracking (Ground Truth / Invest)**

* **Metric:** The sum of all hours logged across **all** IDs within the cluster, regardless of the booking period.

### **D. Code Changes (Code Change Miner)**

The "Code Change Miner" aggregates volume and intensity, including Lines of Code (LoC), complexity, and distribution entropy.

### **E. Scope Definition & Filter Rules**

* **No Epic Aggregation:** The "Ship Unit" is the ticket (Story/Task) including its subtasks.  
* **Ignore Links:** Only the explicit Parent-Subtask hierarchy is considered.  
* **Knowledge-Based Value (KBV):** Captures hours on tickets without code references as well as hours without any explicit ticket reference.

## ---

**3\. Completeness Guarantee & Reconciliation**

To achieve 100% congruence between time tracking and the value model, every logged hour is categorized.

* **Reconciliation** occurs monthly.  
* **Data Quality Score (DQS) & Trend Analysis:** The DQS ($\\frac{Matched \+ KBV}{Total}$) is tracked monthly. Periods with a $DQS \< 85\\%$ are marked via **Confidence Filtering**.

## ---

**4\. Monetary Valuation (The 100% Model)**

The monetary valuation adds Feature Value, Knowledge Value, and General Overhead into a total budget that exactly reflects the logged hours.

## ---

**5\. Objective: Stable Empirical Correlation**

A correlation of $R^2 \> 0.7$ is targeted by incorporating **Change Intensity** (complexity and distribution entropy).

## ---

**6\. Interface Specifications (Data Contracts)**

### **A. Input: ShipUnitCluster (Schema)**

The object generated for each Story/Task after aggregation:

JSON

{  
  "clusterId": "PROJ-123",  
  "ids": \["PROJ-123", "PROJ-1231", "PROJ-1232"\],  
  "metadata": {  
    "type": "Story",  
    "storyPoints": 8.0,  
    "timestamp\_T0": "2024-03-01T10:00:00Z"  
  },  
  "isvAnalysis": {  
    "isvScore": 12.5,  
    "confidence": 0.92  
  },  
  "metrics": {  
    "totalHours": 32.5,  
    "gitChanges": {  
      "locAdded": 450,  
      "locDeleted": 120,  
      "filesChanged": 14,  
      "distributionEntropy": 3,  
      "cyclomaticComplexityDelta": 42,  
      "changeIntensityScore": 0.85  
    }  
  }  
}

## ---

**7\. Calibration Workflow (Implementation Path)**

1. **Cluster-Centric Ingest:** Aggregation based on ticket lifecycles.  
2. **Triple-Matching:** Baseline checkout, ISV run, and Git analysis.  
3. **Reconciliation:** Allocation of overhead.  
4. **Statistical Calibration:** Calculation of the shipRateHoursPerIsv.

## ---

**8\. Data Standard & Parsing Logic for Time Tracking**

A standardized parser process is implemented to transform time logs (L0 data) into usable investment data.

### **A. Target Format: StandardizedTimeEntry**

JSON

{  
  "entryId": "UUID-999",  
  "timestamp": "2024-03-05T14:00:00Z",  
  "durationHours": 4.5,  
  "rawComment": "Work on PROJ-123 and PROJ-124 Refactoring",  
  "detectedIds": \["PROJ-123", "PROJ-124"\],  
  "attributionType": "MULTI\_ID\_SPLIT"  
}

### **B. ID Attribution Strategies (Prioritization)**

* **Direct Match:** If the comment contains exactly one ID belonging to a known cluster \-\> 100% attribution.  
* **Cluster Match:** If the comment contains a subtask ID \-\> Automatic assignment to the parent story’s cluster.  
* **Multi-ID Split:** If multiple IDs from **different** clusters are found:  
  * **Default:** Hours are distributed evenly across all mentioned clusters.  
  * **Threshold:** If more than 3 IDs are found in a short comment, the entry is automatically marked as UNLINKED\_OVERHEAD.  
* **No-ID Catch-all:** Time logs without a recognizable ticket ID automatically flow into the **Knowledge-Based Value (KBV)** for the period. This includes general activities like meetings, admin, and conceptual work not explicitly linked to an architectural delta.

### **C. Exception Handling**

* **Invalid ID Match:** IDs that match the regex but do not exist in Jira (typos) are logged and treated as UNLINKED\_OVERHEAD (data trash).  
* **Ambivalent Entries:** Any entry without an ID is defined as KBV. Content-based review of comments is omitted in favor of statistical stability.

### **D. Data Cleaning (L1 Layer)**

Before data enters the correlation analysis, "zero-performance" entries are removed:

* Entries \< 0.1h (rounding artifacts).  
* Entries on weekends/holidays without Git activity (potential "late entries" lacking architectural context).

Would you like me to create a summary table of the key ISV metrics or help you draft the English version of the Glossary as well?