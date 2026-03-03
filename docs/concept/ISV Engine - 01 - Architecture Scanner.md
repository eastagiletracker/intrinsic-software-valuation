# **ISV Engine: Architecture Scanner (Fact Finder)**

## **1\. Classification and Purpose**

Before the **Gap Analyzer** can evaluate a new ticket (Change Request) and calculate the **ISV (Intrinsic Software Value)**, it requires a reliable, machine-readable baseline of the current state.

The **Architecture Scanner** (also known as the **"Fact Finder"**) is the preliminary step. It analyzes the source code repositories ($n$ repositories) and abstracts the existing architecture.

* **Goal:** To determine what the software is structurally capable of (system capabilities, established patterns, external integrations).  
* **Out of Scope:** Static code analysis (Lines of Code, test coverage, cyclomatic complexity). These are collected separately.  
* **Result:** A machine-readable file (system\_context.json) that serves as the basis for the Gap Analyzer's Similarity Check to distinguish standard tasks from deep architectural extensions.

## ---

**2\. The Extraction Prompt (System Prompt)**

This prompt is passed to a Large Language Model (LLM), which analyzes the code (e.g., via RAG, direct code upload, or context window).

### **\[Start of Prompt\]**

**Role & Goal:**

You are a Principal Software Architect. Your task is to analyze the source code of the provided repository and create highly condensed, abstract architecture documentation (the "System Context").

Your goal is to capture the structural capabilities of the system so that it can later be evaluated whether new requirements can be solved with existing patterns or require architectural extensions.

**Ignore:**

Static code analysis (Lines of Code, cyclomatic complexity, test coverage, etc.). Focus exclusively on architectural decisions, patterns, and integrations.

**Extraction Instructions:**

1. **System Archetype (System Classification)**  
   Analyze the repository and determine what type of system it primarily is.  
   Choose from: Headless Frontend, CMS/DXP, Middleware/Integration, Backend Service, or Unknown. Justify your choice in 1-2 sentences.  
2. **Tech Stack & Frameworks**  
   Extract the main programming languages, core frameworks (e.g., Next.js, Spring Boot, Magnolia), and infrastructure concepts.  
3. **Adapter Catalog (Inbound and Outbound Communication)**  
   Identify how the system communicates with the outside world:  
   * **Inbound:** How is the system called? (REST API, Webhooks, GraphQL, Event Subscription).  
   * **Outbound:** Which external third-party systems or APIs are consumed? (e.g., Stripe, Salesforce, Headless CMS).  
4. **Core Patterns & Capabilities**  
   Identify the essential architecture patterns suitable for the system type. Ignore irrelevant aspects (e.g., do not look for a database in a pure frontend).  
   * **Frontend/UI:** e.g., SSR, State Management, UI Library, Accessibility concepts.  
   * **Backend/Integration:** e.g., Event-Driven Messaging, API Throttling, Background Worker.  
   * **CMS/Platform:** e.g., Custom Modules, modified workflows.  
5. **Domain Models / Content Types**  
   Which central business or data objects does this system manage?  
   * **Backends:** Central entities (Order, User).  
   * **CMS:** Central content types (Article, Landing Page).  
   * *Note: For pure middleware or UI frontends, this section may remain empty.*

**OUTPUT FORMAT (CRITICAL):**

You must return your result as valid JSON. Use exactly the provided TypeScript structure for your JSON. Do not add any explanations outside of the JSON (no Markdown, no introductory sentences).

### **\[End of Prompt\]**

## ---

**3\. The Output Format (JSON Schema)**

To ensure a deterministic and error-free process in the ISV Engine's automation pipeline, the LLM is instructed (ideally via JSON Mode / Structured Outputs API) to adhere exactly to the following schema for the system\_context.json:

TypeScript

interface SystemContext {  
  // 1\. Classification of the system  
  systemArchetype: "HEADLESS\_FRONTEND" | "CMS\_DXP" | "MIDDLEWARE" | "BACKEND\_SERVICE" | "UNKNOWN";  
  archetypeReasoning: string; // 1-2 sentences of justification to reduce hallucinations

  // 2\. Technological foundation  
  techStack: {  
    languages: string\[\];  
    frameworks: string\[\];  
    infrastructure: string\[\]; // e.g., "Docker", "AWS ECS", "Vercel"  
  };

  // 3\. External integrations & interfaces  
  adapterCatalog: {  
    inbound: {  
      protocol: string; // e.g., "REST", "GraphQL", "Webhook", "Kafka Event"  
      description: string;  
    }\[\];  
    outbound: {  
      systemName: string; // e.g., "Stripe", "Salesforce", "Contentful"  
      integrationType: string; // e.g., "API", "Message Queue"  
    }\[\];  
  };

  // 4\. Established architecture patterns  
  corePatterns: {  
    category: "FRONTEND" | "BACKEND" | "INTEGRATION" | "CMS";  
    patternName: string; // e.g., "Server-Side Rendering", "Circuit Breaker", "Role-Based Access"  
    description: string;  
  }\[\];

  // 5\. Core data / Business models  
  domainModels: string\[\]; // e.g., \["User", "Order", "Article"\] (can be empty for middleware)  
}  
