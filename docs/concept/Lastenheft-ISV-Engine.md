# Lastenheft — ISV Engine (Intrinsic Software Valuation)

**Version:** 1.0  
**Datum:** 09. März 2026  
**Status:** Entwurf  
**Auftraggeber:** Bitgrip GmbH  

---

## Inhaltsverzeichnis

1. [Einleitung und Zielsetzung](#1-einleitung-und-zielsetzung)
2. [Systemübersicht](#2-systemübersicht)
3. [Anwendungsfälle](#3-anwendungsfälle)
4. [Fachliches Domänenmodell](#4-fachliches-domänenmodell)
5. [Funktionale Anforderungen](#5-funktionale-anforderungen)
   - 5.1 [FA-100: Fact Finder — Architecture Scanner](#51-fa-100-fact-finder--architecture-scanner)
   - 5.2 [FA-200: Fact Finder — Status Quo Miner](#52-fa-200-fact-finder--status-quo-miner)
   - 5.3 [FA-300: Gap Analyzer](#53-fa-300-gap-analyzer)
   - 5.4 [FA-400: Valuation Engine](#54-fa-400-valuation-engine)
   - 5.5 [FA-500: ISV-Berechnung (Einzelticket-Pipeline)](#55-fa-500-isv-berechnung-einzelticket-pipeline)
   - 5.6 [FA-600: Historische Kalibrierung (Batch-Pipeline)](#56-fa-600-historische-kalibrierung-batch-pipeline)
   - 5.7 [FA-700: Externe Adapter und Datenquellen](#57-fa-700-externe-adapter-und-datenquellen)
   - 5.8 [FA-800: Git-Worktree-Management](#58-fa-800-git-worktree-management)
   - 5.9 [FA-900: CLI-Schnittstelle](#59-fa-900-cli-schnittstelle)
   - 5.10 [FA-1000: Web-Oberfläche](#510-fa-1000-web-oberfläche)
   - 5.11 [FA-1100: Kalibrierungsreport und Visualisierung](#511-fa-1100-kalibrierungsreport-und-visualisierung)
   - 5.12 [FA-1200: Caching und Persistenz](#512-fa-1200-caching-und-persistenz)
   - 5.13 [FA-1300: Projektkonfiguration](#513-fa-1300-projektkonfiguration)
6. [Nichtfunktionale Anforderungen](#6-nichtfunktionale-anforderungen)
7. [Architektur und Technologievorgaben](#7-architektur-und-technologievorgaben)
8. [Datenmodell und Schnittstellen-Schemata](#8-datenmodell-und-schnittstellen-schemata)
9. [Teststrategie](#9-teststrategie)
10. [Abgrenzungen](#10-abgrenzungen)
11. [Glossar](#11-glossar)

---

## 1. Einleitung und Zielsetzung

### 1.1 Projektziel

Die ISV Engine (Intrinsic Software Valuation Engine) ist ein vollautomatisiertes System zur objektiven, dimensionslosen Bewertung der strukturellen Komplexität von Software-Änderungsanforderungen (Tickets). Statt subjektiver Zeitschätzungen durch Entwickler berechnet das System einen reproduzierbaren **Intrinsic Software Value (ISV)** auf Basis von Code-Analyse, Architektur-Erkennung und KI-gestützter Lückenanalyse.

### 1.2 Geschäftlicher Nutzen

- **Objektive Bewertung:** Ablösung subjektiver Story-Point-Schätzungen durch messbare, reproduzierbare Werte.
- **Delta-Fokus:** Der ISV misst nicht die absolute Größe eines Features, sondern den strukturellen Abstand zwischen Ist-Zustand des Codes und Soll-Zustand der Anforderung.
- **Kommerzielle Sichtbarkeit von Technical Debt:** Technische Schulden werden über den State Factor (C2) kaufmännisch sichtbar — selbst kleine Änderungen in toxischem Legacy-Code erzeugen hohe ISV-Werte.
- **Historische Kalibrierung:** Durch Abgleich mit realen Zeitbuchungen wird eine empirische Umrechnung (Ship Rate) von ISV-Punkten in Stunden/Euro ermöglicht.

### 1.3 Zielgruppe dieses Dokuments

Dieses Lastenheft richtet sich an externe Dienstleister oder interne Teams, die mit der (Teil-)Realisierung der ISV Engine beauftragt werden. Es beschreibt die funktionalen und nichtfunktionalen Anforderungen vollständig genug, um eine Aufwandsschätzung zu erstellen.

---

## 2. Systemübersicht

### 2.1 Phasenmodell

Die ISV Engine arbeitet in drei sequenziellen Phasen:

```
Phase 1: Fact Finder (Digitaler Zwilling)
  ├── Architecture Scanner (KI-gestützt) → SystemContext (JSON)
  └── Status Quo Miner (deterministisch) → CodeHealthReport (JSON)
          │
          ▼
Phase 2: Gap Analyzer (KI-Brücke)
  └── Architektur-Delta (Ist vs. Soll) → GapAnalysisResult (JSON)
          │
          ▼
Phase 3: Valuation Engine (Rechner)
  └── Deterministische Formel → ISV Score (Zahl)
```

### 2.2 Zwei Betriebsmodi

| Modus | Beschreibung | Trigger | Ergebnis |
|---|---|---|---|
| **Einzelticket-Berechnung** | Berechnet ISV für ein einzelnes Ticket in Echtzeit | CLI-Kommando, Web-UI, API | ISV-Score + Gap-Report |
| **Historische Kalibrierung** | Batch-Verarbeitung vieler Tickets über einen Zeitraum, korreliert mit realen Zeitbuchungen | CLI-Kommando | Ship Rate, R², statistische Diagnostik |

### 2.3 Datenfluss (Ende-zu-Ende)

```
Jira-Tickets (XML) ──► Ticket-Client ──┐
                                        │
Git-Repositories ──► Git-Client ──┐     │
                                  │     │
  ┌───────────────────────────────┤     │
  │                               │     │
  ▼                               ▼     │
Status Quo Miner          Architecture Scanner
  │ (deterministisch)       │ (KI/LLM)
  │                         │
  └────────┬────────────────┘
           ▼
     Gap Analyzer (KI/LLM)
           │
           ▼
     Valuation Engine (deterministisch)
           │
           ▼
     ISV Score + Gap Report
           │
           │  (nur in Kalibrierung:)
           ▼
Zeiterfassung ──► Time-Tracking-Client ──► Statistische Regression
                                              │
                                              ▼
                                         Ship Rate + Diagnostik
```

---

## 3. Anwendungsfälle

### UC-1: Einzelticket-ISV-Berechnung

**Akteur:** Entwickler, Product Owner  
**Vorbedingung:** Projektkonfiguration vorhanden, Git-Repositories erreichbar, LLM verfügbar  
**Ablauf:**
1. Nutzer übergibt eine Ticket-ID und einen Projekt-Slug.
2. System lädt Ticket-Metadaten (Titel, Beschreibung, Subtasks).
3. System führt Git-Checkout aller konfigurierten Repositories zum Zeitpunkt T0 durch.
4. Pro Repository parallel: Status Quo Miner + Architecture Scanner ausführen.
5. Gap Analyzer vergleicht Ticket mit aggregierter Baseline.
6. Valuation Engine berechnet ISV-Score.
7. Ergebnis wird als strukturierter JSON-Report ausgegeben.

**Ergebnis:** `EnrichedIsvResult` mit Ticket-Metadaten, per-Repository-Ergebnissen, Gap-Analyse, ISV-Score und Faktor-Aufschlüsselung.

### UC-2: Historische Kalibrierung

**Akteur:** Analyst, Projektleiter  
**Vorbedingung:** Projektkonfiguration vorhanden, Jira-Export + Zeitbuchungen + Git-Repositories verfügbar  
**Ablauf:**
1. Nutzer gibt Projekt-Slug und Zeitfenster (z. B. `2024-10` bis `2026-03`) an.
2. System lädt alle Tickets im Zeitraum und gruppiert sie in Ship Unit Cluster (Story + Subtasks).
3. System lädt Zeitbuchungen und ordnet sie Clustern zu (Time Attribution).
4. Pro Cluster: historischer Git-Checkout auf T0, Fact Finder, Gap Analyzer, Valuation.
5. Zusammenführung aller Cluster-ISV-Werte mit realen Stunden.
6. Multivariate Regression: Ship Rate, R², Faktor-Diagnostik, Residuen.
7. Ergebnis wird als JSON-Report persistiert.

**Ergebnis:** `CalibrationRunOutput` mit Ship Rate, statistischer Diagnostik, per-Cluster-Residuen und Validierungsaussagen.

### UC-3: Kalibrierungsreport anzeigen

**Akteur:** Stakeholder, Manager  
**Vorbedingung:** Mindestens ein Kalibrierungslauf abgeschlossen  
**Ablauf:**
1. Nutzer öffnet Web-Oberfläche.
2. System listet verfügbare Projekte und deren gespeicherte Reports.
3. Nutzer wählt einen Report aus.
4. System rendert interaktive Visualisierungen (Scatter-Plot, Residuen, Diagnostik).

**Ergebnis:** Visuell aufbereiteter Kalibrierungsreport mit Drill-Down auf Cluster-Ebene.

### UC-4: Projekt initialisieren

**Akteur:** Administrator  
**Vorbedingung:** Projektdaten (Git-URLs, Jira-Export, Zeitbuchungen) liegen vor  
**Ablauf:**
1. Nutzer führt `isv init --project <slug>` aus.
2. System erstellt Verzeichnisstruktur: `data/<slug>/calibration-runs/`, `git/repos/`, `git/work/`, etc.
3. System generiert eine Template-Konfigurationsdatei.
4. Optional `--warmup`: Datenquellen werden in SQLite-Layer geladen.

**Ergebnis:** Projektverzeichnis mit valider Konfiguration, bereit für Berechnung/Kalibrierung.

---

## 4. Fachliches Domänenmodell

### 4.1 ISV-Formel (Version 3.4)

$$ISV = ((A1 \times A2) + B1) \times (C1 \times C2) \times D3$$

| Abschnitt | Formelanteil | Bedeutung |
|---|---|---|
| **PO-Wert** (Fachlicher Wert) | $(A1 \times A2) + B1$ | Was wird gebaut? |
| **Architekturfaktor** (Technischer Hebel) | $C1 \times C2$ | Wie tief der Eingriff, bei welchem Systemzustand? |
| **Qualitätsmultiplikator** | $D3$ | Welches Qualitätsniveau wird gefordert? |

### 4.2 ISV-Faktoren

| Faktor | Name | Skala | Beschreibung |
|---|---|---|---|
| **A1** | Data Value | 1, 2, 3, 5 (Fibonacci) | Tiefe des Eingriffs in Datenmodelle/Entitäten |
| **A2** | UX Multiplier | 1, 2, 3 | UI-Komplexität (1 = headless, 3 = Custom-UI mit komplexem State) |
| **B1** | Logic Value | 0, 1, 2, 3, 5, 8 | Algorithmische Tiefe der Geschäftslogik |
| **C1** | Integration Factor | 1, 2, 3, 5 | Integrationstiefe (1 = lokal, 5 = neues Drittsystem) |
| **C2** | State Factor | 1, 2, 3 | Technische Schulden — abgeleitet aus Health-Metriken |
| **D3** | Quality Multiplier | 1, 2, 3 | Qualitätsanforderungen (Compliance, WCAG, Audits) |

### 4.3 C2-Ableitung (deterministisch)

C2 wird automatisch aus Code-Health-Metriken abgeleitet — nie manuell gesetzt:

| Metrik | Grenzwert | Strafpunkte |
|---|---|---|
| Avg. Cyclomatic Complexity | < 5: 0 / 5–15: 1 / > 15: 2 |
| Duplication Percentage | < 5 %: 0 / 5–20 %: 1 / > 20 %: 2 |
| Coverage Percentage | ≥ 70 %: 0 / 40–70 %: 1 / < 40 %: 2 |
| God Class Count | < 5: 0 / ≥ 5: 1 |

- **Gesamtstrafe 0–1** → C2 = 1 (sauber)
- **Gesamtstrafe 2–4** → C2 = 2 (moderate Schulden)
- **Gesamtstrafe 5+** → C2 = 3 (toxischer Legacy-Code)

Bei mehreren Repositories: C2 = **Maximum** über alle Repos (ein toxisches Repo vergiftet die Gesamtbewertung).

### 4.4 Zentrale Domänenobjekte

| Objekt | Beschreibung |
|---|---|
| **SystemContext** | KI-generierte Architektur-Dokumentation eines Repositories (Archetype, Tech Stack, Adapter, Patterns, Domain Models) |
| **CodeHealthReport** | Deterministische Metriken (LoC, Komplexität, Coverage, Hotspots) pro Repository |
| **SystemBaseline** | Aggregiertes Bild aller Repositories zu einem Zeitpunkt T0 |
| **GapAnalysisResult** | KI-generierte Lückenanalyse (Daten-, UI-, Logik-, Integrations-Gap + ISV-Faktoren) |
| **IsvResult** | Berechnetes ISV-Ergebnis mit Formelversion, Faktoren und Breakdown |
| **ShipUnitCluster** | Logical-Unit aus Story + Subtasks mit ISV-Analyse und gemessenen Stunden |
| **CalibrationResult** | Statistische Auswertung: Ship Rate, R², Diagnostik, Residuen, Outlier |
| **Ticket** | Jira-Ticket mit ID, Typ, Status, Titel, Beschreibung, Parent, Labels, Kommentare |
| **TimeEntry** | Zeitbuchungseintrag mit Timestamp, Dauer, erkannten Ticket-IDs und Attributionsstrategie |

---

## 5. Funktionale Anforderungen

### 5.1 FA-100: Fact Finder — Architecture Scanner

#### FA-101: Repository-Sampling

Das System MUSS den Quellcode eines Repositories intelligent samplen, um eine kompakte, aber repräsentative Darstellung für das LLM zu erzeugen.

**Sampling-Strategie:**
- Verzeichnisbaum bis 4 Ebenen Tiefe (Noise-Verzeichnisse ausgeschlossen: `node_modules`, `dist`, `.git`, `build`, `target`, etc.)
- Schlüssel-Konfigurationsdateien erkennen und extrahieren (`package.json`, `pom.xml`, `build.gradle`, `tsconfig.json`, `Dockerfile`, etc.)
- Dependency-Extraktion aus Maven/npm (bis zu 40 Dependencies)
- Gezielte Datei-Suche in drei Kategorien:
  - Domain-Modelle: bis zu 10 Dateien (Pattern-Matching auf Dateinamen)
  - Adapter: bis zu 10 Dateien
  - Entry-Points: bis zu 5 Dateien
- Import-Zusammenfassung (Top 50 Imports)
- **Prompt-Budget:** Maximum 30 KB Gesamtkontext für das LLM

#### FA-102: LLM-gestützte Architektur-Analyse

Das System MUSS den gesampleten Code an ein LLM senden und eine strukturierte Architektur-Dokumentation zurückerhalten.

**LLM-Prompt-Inhalt:**
- Rolle: Principal Software Architect
- Aufgabe: Strukturelle Capabilities erfassen
- Zu extrahieren:
  1. System-Archetype: `HEADLESS_FRONTEND | CMS_DXP | MIDDLEWARE | BACKEND_SERVICE | UNKNOWN`
  2. Tech Stack: Sprachen, Frameworks, Infrastruktur
  3. Adapter-Katalog: Inbound (Protokoll, Beschreibung) + Outbound (Systemname, Integrationstyp)
  4. Core Patterns: Kategorie, Name, Beschreibung
  5. Domain Models: Entitätsnamen
- Temperature: 0.0–0.1 (deterministische Analyse)

**Ausgabe:** `SystemContext` als streng typisiertes JSON (siehe Schema in Abschnitt 8).

#### FA-103: JSON-Extraktion und Fehlerbehandlung

Das System MUSS robustes JSON-Parsing der LLM-Antwort durchführen:
- Markdown-Fences (`\`\`\`json ... \`\`\``) entfernen
- Preambles und Trailing-Text ignorieren
- Äußerstes `{ … }` Objekt extrahieren
- Validierung gegen Zod-Schema mit informativer Fehlermeldung

#### FA-104: Caching

- Cache-Key: `(repositoryId, commitSha)`
- Cache-Speicher: Dateisystem unter `data/<slug>/cache/architecture-scanner/`
- Cache-Hit: LLM-Aufruf wird übersprungen, gecachtes Ergebnis zurückgegeben
- Konfigurierbar: `enabled: true/false`

---

### 5.2 FA-200: Fact Finder — Status Quo Miner

#### FA-201: Statische Code-Analyse

Pro Repository MÜSSEN folgende Metriken deterministisch erhoben werden:

**Strukturelle Fakten:**
- Volumen: Total Lines of Code (LoC), Anzahl Dateien (via `scc`)
- Entry-Points: Anzahl Controller/Resolver/Routes (Backend) bzw. Pages/Views (Frontend) — durch Dateinamen-Pattern-Matching
- Git-Hotspots: Top N am häufigsten geänderte Dateien der letzten 12 Monate (via `git log`)

**Health-Scores:**
- Durchschnittliche zyklomatische Komplexität (via `scc`)
- Duplikations-Prozentsatz (via `jscpd`)
- God-Class-Anzahl: Dateien mit > 1000 Zeilen (via `scc`)
- Test-Coverage-Prozentsatz (optional, wenn Framework-spezifische Auswertung verfügbar)
- Dead-Code-Dateien (via `knip`, nur JS/TS-Projekte)

#### FA-202: Historischer Checkout (Time-Travel)

- Für jedes Repository wird der letzte Commit **vor** dem Zeitstempel T0 identifiziert.
- Checkout erfolgt über isolierte Git-Worktrees (siehe FA-800).
- Bei nicht vorhandenen Commits im Zeitraum: Fehlermeldung mit Repository-ID.

#### FA-203: Ausgabe

Pro Repository ein `CodeHealthReport` als JSON mit:
- Repository-Referenz
- Zeitstempel
- `structuralFacts`: Volume + Entry-Points + Git-Hotspots
- `healthScores`: Complexity + Test Health

---

### 5.3 FA-300: Gap Analyzer

#### FA-301: Baseline-Serialisierung

Das System MUSS die SystemBaseline für das LLM-Prompt wie folgt aufbereiten:
- Pro Repository: `repositoryId`, `systemArchetype`, `languages`, `frameworks`, `inbound[].protocol`, `outbound[].systemName`, `corePatterns[].patternName`, `domainModels`
- Ticket: `ticketId`, `type`, `title`, `description`, ggf. Subtask-Informationen

#### FA-302: KI-gestützte Lückenanalyse

Das LLM MUSS eine strukturierte Gap-Analyse in vier Dimensionen durchführen:

1. **Daten-Gap:** Fehlende Entitäten, Schema-Erweiterungen?
2. **UI/UX-Gap:** Custom-UI jenseits etablierter Patterns?
3. **Logik-Gap:** Neuer Geschäftslogik-Bedarf (CRUD vs. Workflow vs. Algorithmus)?
4. **Integration-Gap:** Fehlende Third-Party-Anbindungen?

#### FA-303: ISV-Scoring durch LLM

Das LLM MUSS die fünf Faktoren A1, A2, B1, C1, D3 bewerten:
- Ausschließlich auf der definierten Fibonacci-Ganzzahl-Skala (keine Interpolation, keine Brüche)
- Mit Begründung (`reasoning`) pro Faktor
- Ticket-Qualitätsprüfung: `isTicketActionable` (bool) + `confidenceScore` (0–1)

#### FA-304: D3-Quality-Floor

Nach dem LLM-Aufruf wird `D3 = max(LLM-Score, config.d3QualityFloor)` gesetzt. Der Quality Floor kommt aus der Projektkonfiguration.

#### FA-305: Rohdaten-Nachbearbeitung

- Score-Snapping: LLM-Werte werden auf nächsten gültigen Fibonacci-Wert gerundet
- Typkonvertierung: String → Number falls nötig
- `null` → `undefined` Normalisierung für Zod-Kompatibilität

#### FA-306: Caching

- Cache-Key: Hash aus `{ticketId, ticketType, ticketTitle, ticketDescription, d3QualityFloor, repos[{repositoryId, systemArchetype, languages, frameworks, inboundProtocols, outboundSystems, patterns, domainModels}]}`
- **T0-Zeitstempel ist NICHT Teil des Cache-Keys** (Re-Runs mit unterschiedlichem T0 nutzen Cache)
- Konfigurierbar: `enabled: true/false`

---

### 5.4 FA-400: Valuation Engine

#### FA-401: ISV-Berechnung

Reine deterministische Berechnung ohne KI:

$$ISV = ((A1 \times A2) + B1) \times (C1 \times C2) \times D3$$

Ausgabe: `IsvResult` mit:
- `formulaVersion` (z. B. `"3.4"`)
- `ticketId`
- Alle 6 Faktoren
- Breakdown: `poValue`, `archFactor`, `qualityMultiplier`
- `isvScore`

#### FA-402: C2-Ableitung

Das System MUSS C2 deterministisch aus HealthScores ableiten (siehe Abschnitt 4.3).

#### FA-403: C2-Aggregation

Bei Multi-Repository-Setups: `effectiveC2 = max(c2 über alle Repos)`

#### FA-404: Formel-Versionierung

- Jede Formeländerung erfordert eine neue Versionsnummer.
- Kalibrierungsergebnisse referenzieren die Formelversion.
- Die Formel wird **nie** automatisch angepasst.

---

### 5.5 FA-500: ISV-Berechnung (Einzelticket-Pipeline)

#### FA-501: Pipeline-Schritte

Die Pipeline durchläuft 8 Schritte in definierter Reihenfolge:

| # | Schritt | Beschreibung |
|---|---|---|
| 1 | `ticket-fetched` | Ticket + Subtasks aus Jira laden |
| 2 | `repos-checked-out` | Alle Repositories zum Zeitpunkt T0 auschecken |
| 3 | `code-health-mined` | Mining aller Repos (Barriere: alle abgeschlossen) |
| 4 | `architecture-scanned` | Pro Repo (N-mal emittiert, LLM-gesteuert) |
| 5 | `c2-derived` | C2 State aus Health Scores ableiten |
| 6 | `gap-analyzed` | Gap-Analyse gegen Ticket |
| 7 | `factors-assembled` | ISV-Faktoren zusammenstellen |
| 8 | `isv-calculated` | Finaler ISV-Score |

#### FA-502: Parallele Verarbeitung

- Mining und Scanning laufen **pro Repository parallel**.
- Alle Repositories werden **gleichzeitig** verarbeitet.
- LLM-Aufrufe werden über ein Semaphore begrenzt (konfigurierbare Konkurrenz, Standard: 5).
- Git-Checkouts erfolgen parallel über `Promise.all()`.

#### FA-503: Progress-Events

Jedes Pipeline-Stadium emittiert ein `PipelineProgressEvent`:
- `step`, `completedSteps`, `totalSteps`
- Optional: `data`, `detail`
- Callback-Fehler werden verschluckt (kein Pipeline-Absturz).
- AbortSignal wird an definierten Safe-Points geprüft.

#### FA-504: Ausgabe

`EnrichedIsvResult` enthält:
- Ticket + Subtasks
- SystemBaseline (per-Repo + effectiveC2)
- GapAnalysisResult
- IsvResult
- Per-Repository-Ergebnisse (Health, Context, C2)

---

### 5.6 FA-600: Historische Kalibrierung (Batch-Pipeline)

#### FA-601: Pipeline-Phasen

| # | Phase | Beschreibung |
|---|---|---|
| 1 | `loading-tickets` | Alle Tickets im Zeitraum laden |
| 2 | `clustering` | Tickets in Ship Unit Cluster gruppieren (Parent + Subtasks) |
| 3 | `loading-time-entries` | Zeitbuchungen im Zeitraum laden |
| 4 | `attributing-time` | Stunden den Clustern zuordnen |
| 5 | `calculating-dqs` | Data Quality Score berechnen |
| 6 | `processing-clusters` | Pro Cluster: T0 → Fact Find → Gap → Valuation |
| 7 | `running-regression` | Ship Rate Regression + Diagnostik |
| 8 | `writing-report` | Ergebnisse als JSON persistieren |

#### FA-602: Ticket-Clustering

- Ein **Ship Unit Cluster** besteht aus einer Story/Task und ihren direkten Subtasks.
- Nur Parent-Subtask-Hierarchie wird berücksichtigt — keine Epic-Aggregation.
- Jira-Link-Relationen werden ignoriert.

#### FA-603: Time Attribution (5 Strategien)

Jede Zeitbuchung wird einer Attribution-Strategie zugeordnet:

| Priorität | Strategie | Bedingung | Verhalten |
|---|---|---|---|
| 1 | **DIRECT** | Genau eine bekannte Ticket-ID im Kommentar | Volle Zuordnung |
| 2 | **CLUSTER** | Mehrere IDs, alle zum selben Cluster | Volle Zuordnung zum Cluster |
| 3 | **SPLIT** | IDs aus verschiedenen Clustern | Gleichmäßig aufteilen |
| 4 | **THRESHOLD** | > 3 IDs in kurzem Kommentar | → `UNLINKED_OVERHEAD` |
| 5 | **UNLINKED_OVERHEAD** | Keine erkannte ID | → Period-KBV |

#### FA-604: Data Quality Score (DQS)

$$DQS = \frac{\text{Zugeordnete Stunden} + \text{KBV-Stunden}}{\text{Gesamtstunden}}$$

- Perioden mit DQS < 85 % werden über Confidence-Filtering markiert.
- DQS wird monatlich getrennt nach Datenquellen berechnet.

#### FA-605: Konkurrente Cluster-Verarbeitung

- Cluster werden über eine Work Queue (`p-queue`) parallel verarbeitet.
- Konfigurierbare Cluster-Konkurrenz (Standard: 3).
- Konfigurierbare LLM-Konkurrenz (Standard: 2), unabhängig vom Worker-Count.
- Per-Task-Timeout (Standard: 5 Minuten).
- SIGINT-Handling: Queue pausieren, laufende Tasks abschließen, sauber beenden.

#### FA-606: Checkpoint und Resume

- **JSONL-Checkpoint:** `data/<slug>/calibration-runs/<runId>/progress.jsonl`
  - Append-Only-Log mit abgeschlossenen und übersprungenen Cluster-IDs
  - Thread-sicher durch internen Mutex
- **SQLite RunStore:** `data/<slug>/calibration-runs/<runId>/store.db`
  - Tabellen: `runs` (Metadaten) + `clusters` (per-Cluster-Status)
  - WAL-Modus für parallele Schreibzugriffe
  - Status: `pending | running | done | failed | skipped`
- Resume über `--run-id <id>`: Bereits verarbeitete Cluster werden übersprungen.

#### FA-607: T0-Bestimmung pro Cluster

- Bevorzugt: Erster relevanter Git-Commit
- Fallback: Jira-Status-Transition-Datum
- T0 bestimmt den historischen Checkout-Zeitpunkt für die Codebase

#### FA-608: Git Change Metrics (pro Cluster)

Neben dem ISV-Score werden Git-Änderungsmetriken erhoben:

| Metrik | Beschreibung |
|---|---|
| `linesAdded` / `linesDeleted` | Netto-Codeänderung |
| `filesChanged` | Anzahl geänderter Dateien |
| `distributionEntropy` | Shannon-Entropie der Zeilen-pro-Datei-Verteilung |
| `cyclomaticComplexityDelta` | CC-Differenz T0 → HEAD |
| `changeIntensityScore` | Komposit (0–1) aus LoC, Entropie, Komplexität |

#### FA-609: Multivariate Regression

Regressionsanalyse mit 9 unabhängigen Variablen:
- 6 ISV-Faktoren: A1, A2, B1, C1, C2, D3
- 3 Git-Metriken: `distributionEntropy`, `cyclomaticComplexityDelta`, `changeIntensityScore`
- Abhängige Variable: `totalHours`

**Log-Transformation:** Regression auf $\ln(\text{hours})$ (Komprimierung der rechtsschiefen Verteilung).

**Weighted Least Squares (WLS):** Wenn `dataConfidence` verfügbar:
- `high` (Gewicht 1.0): Hat Git-Änderungen + ≥ 80 % Direct-Match-Stunden
- `medium` (Gewicht 0.5): Hat Git-Änderungen + < 80 % Direct-Match
- `low` (Gewicht 0.2): Keine Git-Änderungen oder Nahe-Null-Stunden

Fallback auf ungewichtetes OLS wenn keine Confidence-Daten vorhanden.

#### FA-610: Factor-Level Diagnostics

Für jeden der 9 Features (Faktoren + Git-Metriken):
- **Partielle Korrelation** (r): Korrelation mit Stunden unter Kontrolle aller anderen Features
- **Standardisierter β-Gewicht**: Empirische Richtung und Stärke
- **p-Wert**: Statistische Signifikanz
- Diese Diagnostik ist **immer** Bestandteil des Outputs, nicht optional.

#### FA-611: Residuen und Ausreißer

- Pro Cluster: `predictedHours`, `residual` (actual − predicted), `standardizedResidual`
- Ausreißer: |standardisierter Residual| > 2
- Labeling: `UNCLASSIFIED`, `ZERO_GIT_CHANGES`, `EXTREME_HOURS`, `NEAR_ZERO_HOURS`
- Ship Rate wird **mit und ohne Ausreißer** berichtet.

#### FA-612: Normalitätsprüfung

- **Shapiro-Wilk** (n < 50) oder **Kolmogorov-Smirnov** (n ≥ 50)
- Output: Teststatistik, p-Wert, Schiefe, Kurtosis
- Flag: `pass` (p ≥ 0.05), `warning` (0.01 ≤ p < 0.05), `fail` (p < 0.01)

#### FA-613: Reliability Summary

Strukturierter Zuverlässigkeitsblock:
- Stichprobengröße + effektive Größe (nach Ausreißer-Exklusion)
- Standardfehler der Ship-Rate-Schätzung
- 95 %-Konfidenzintervall
- Variationskoeffizient
- DQS
- Normalitäts-Flag

#### FA-614: Formula Validation

- **Validity Statements:** Textuelle Bewertung (strong / moderate / weak fit)
- **Factor Correlation Ranking:** Faktoren sortiert nach |partieller Korrelation|
- **Formula-vs-Reality-Vergleich:** Mismatch-Erkennung (additiver vs. multiplikativer Formelanteil vs. empirisches Gewicht)
- **Recommendations:** Faktoren mit p > 0.10 werden für Review empfohlen

#### FA-615: Report-Persistenz

- Datei: `data/<slug>/calibration/report-<periodStart>_<periodEnd>.json`
- Namenskonvention: `report-YYYY-MM_YYYY-MM.json`
- Mehrere Runs pro Projekt koexistieren.
- Optionaler Manifest: `data/<slug>/calibration/index.json`

---

### 5.7 FA-700: Externe Adapter und Datenquellen

#### FA-701: Jira-Client (Ticket-Adapter)

| Eigenschaft | Wert |
|---|---|
| **Rohformat** | Jira XML Export (RSS 0.92 / Atlassian JIRA 9.x) |
| **Eingabe** | XML-Dateien in `data/<slug>/tickets/*.xml` |
| **Funktionen** | Ticket-Parsing, Deduplizierung (nach ticketId, neuestes updatedAt), Filter (by-ticket-numbers, with-subtasks, all), Zeitraum-Filter |
| **Ausgabe** | `Ticket[]` — ID, Typ, Status, Titel, Beschreibung, Parent, Labels, Kommentare, Story Points |

**Erweiterbarkeit:** Die Architektur MUSS den Austausch des Jira-XML-Adapters gegen alternatives Format (Jira REST API, CSV) über das Port-Interface ermöglichen.

#### FA-702: LLM-Client

| Eigenschaft | Wert |
|---|---|
| **Provider** | GitHub Copilot CLI (`gh copilot`) |
| **Adapter** | Shell-basiert über `gh copilot suggestion` + JSON-Parsing |
| **Konfiguration** | `timeoutMs`, `stallTimeoutMs`, `cwd` |
| **Fehlerbehandlung** | Stall-Timeout-Erkennung mit eigenem Error-Code (`LLM_STALL`), Retry mit erhöhtem Backoff (≥ 10 s), separater Max-Retry-Count für Stalls (Standard: 4) |

**Erweiterbarkeit:** Port-Interface `LlmPort` mit `prompt(input): Promise<LlmPromptResult>`. Weitere Provider (OpenAI, Anthropic, lokale Modelle) MÜSSEN als zusätzliche Adapter integrierbar sein.

#### FA-703: Git-Client (siehe FA-800 für Worktree-Details)

| Eigenschaft | Wert |
|---|---|
| **Operationen** | `prepare()`, `checkout()`, `release()`, `logStats()`, `destroy()` |
| **Implementierung** | CLI-basiert über `git` Kommandos via Subprocess |
| **Persistenz** | Bare Clones in `data/<slug>/git/repos/`, Worktrees in `data/<slug>/git/work/` |
| **Caching** | `logStats` cachebare per (repositoryId, since, until) |

#### FA-704: Static-Analysis-Client

| Tool | Zweck | Ausgabe |
|---|---|---|
| `scc` | Lines of Code, Dateien, Komplexität, God Classes | `{ totalLinesOfCode, totalFiles, avgCyclomaticComplexity, godClassCount }` |
| `jscpd` | Code-Duplikation | `{ duplicationPercentage }` |
| `knip` | Toter Code (JS/TS) | `{ deadCodeFiles }` |

Alle Tools werden als CLI-Subprozesse ausgeführt. Die Ergebnisse werden strukturiert zusammengeführt (Structural Facts + Health Scores).

**Caching:** Optional dateibasiert (`FileCache`).

#### FA-705: Time-Tracking-Client

Drei unterstützte Rohformate:

| Format | Adapter | Dateiformat | Quelle |
|---|---|---|---|
| `teamleader-excel` | TeamleaderExcelAdapter | `.xlsx` | Teamleader Focus Excel-Export |
| `teamleader-pdf` | TeamleaderPdfAdapter | `.pdf` | Teamleader Focus PDF-Export (via `pdfjs-dist`) |
| `projektron-bcs-excel` | ProjektronBcsExcelAdapter | `.xlsx` | Projektron BCS Excel-Export |

**Datei-Discovery:**
- Legacy-Einzelquelle: `data/<slug>/time-tracking/*.{xlsx|pdf}`
- Multi-Source: `data/<slug>/time-tracking/<subFolder>/*.{xlsx|pdf}`

**Shared Helper** (`utils/helpers.ts`):
- `extractTicketIds()`: Regex-basierte Ticket-ID-Erkennung in Kommentaren
- `classifyAttribution()`: Zuordnung zu den 5 Attributionsstrategien
- `parseDateToIso()`: Datums-Normalisierung

**Caching:** Dateibasiert oder SQLite-backed (configurable).

**Standardisiertes Ausgabeformat** (`TimeEntry`):
```json
{
  "timestamp": "2024-03-05T14:00:00Z",
  "durationHours": 4.5,
  "rawComment": "Work on PROJ-123 and PROJ-124",
  "detectedIds": ["PROJ-123", "PROJ-124"],
  "attributionType": "SPLIT"
}
```

**Erweiterbarkeit:** Port-Interface `TimeTrackingPort` mit `parse(filePath): Promise<TimeSheet>`. Neue Formate (Harvest, Clockify, CSV) MÜSSEN als zusätzliche Adapter integrierbar sein.

---

### 5.8 FA-800: Git-Worktree-Management

#### FA-801: Bare-Clone-Strategie

- Beim ersten Zugriff auf ein Repository wird ein Bare Clone angelegt unter `data/<slug>/git/repos/<repositoryId>/`.
- Bare Clones werden als persistente Basis für Worktrees verwendet.
- `fetch` aktualisiert bei Bedarf den Bare Clone.

#### FA-802: Worktree-Isolation

- Pro Checkout wird eine isolierte Worktree angelegt unter `data/<slug>/git/work/<repositoryId>-<shortSha>-<random>/`.
- **Eindeutiger 6-Zeichen-Zufalls-Suffix** verhindert Kollisionen bei paralleler Verarbeitung.
- Worktrees sind kurzlebig: nach Analyse wird `release(tree)` aufgerufen.

#### FA-803: Historischer Checkout

- `checkout(repo, before: IsoTimestamp)`:
  1. Letzen Commit vor `before` identifizieren: `git log --before=<timestamp> -1 --format=%H`
  2. Worktree anlegen: `git worktree add <path> <commitSha> --detach`
  3. `WorkingTree`-Objekt zurückgeben mit `{ directory, commitSha, repositoryId }`

#### FA-804: Parallele Checkouts

- `checkoutAll(before)` checkt alle konfigurierten Repositories **parallel** aus (`Promise.all`).
- Rückgabe: `Map<repositoryId, WorkingTree>`

#### FA-805: Ressourcen-Freigabe

- `release(tree)`: Einzelne Worktree entfernen (`git worktree remove`).
- `releaseAll()`: Alle aktiven Worktrees aufräumen (Safety-Catch in `finally`-Blöcken).
- `destroy()`: Bare Clone und alle Worktrees entfernen.

#### FA-806: Konkurrenz-Sicherheit

- **Per-Repository Mutex:** Serialisiert `checkout()` und `release()` für dasselbe Bare Repository.
- Verschiedene Repositories bleiben parallel.
- Mutex-Implementierung: Promise-Chain (kein externer Lock).

#### FA-807: Git-Log-Statistiken

- `logStats(repositoryId, { since?, until?, hotspotLimit? })`:
  - Lines Added/Deleted (via `git log --numstat`)
  - Files Changed
  - Hotspot-Ranking (Top N Dateien nach Änderungshäufigkeit)
- Cachebare per (repositoryId, since, until)

---

### 5.9 FA-900: CLI-Schnittstelle

#### FA-901: Kommando `isv init`

```
isv init --project <slug> [--warmup]
```

- Erstellt Verzeichnisstruktur: `calibration-runs/`, `git/repos/`, `git/work/`, `cache/`
- Erzeugt Template `project-config.json` falls nicht vorhanden
- Validiert bestehende Konfiguration
- `--warmup`: Befüllt SQLite Data Layer (Tickets + Zeitbuchungen)
- **Idempotent:** Wiederholte Ausführung ohne Nebenwirkungen

#### FA-902: Kommando `isv calculate`

```
isv calculate <ticketId> --project <slug> [--json]
```

- Lädt Projektkonfiguration aus `data/<slug>/project-config.json`
- Instanziiert ISV-Calculation-Pipeline mit Konfiguration
- Progress-Events nach `stderr` (Format: `[step N/M] <stepId> — <detail>`)
- Ergebnis als Pretty-Print JSON nach `stdout`
- `--json`: Unterdrückt stderr-Progress
- **Exit Codes:** 0 (Erfolg), 1 (User Error), 2 (Pipeline Error)

#### FA-903: Kommando `isv calibrate`

```
isv calibrate --project <slug> [--from YYYY-MM] [--to YYYY-MM] [--run-id <id>]
              [--concurrency <n>] [--llm-concurrency <n>]
              [--d3-quality-floor <1|2|3>] [--min-confidence <n>]
              [--json] [--status]
```

- Lädt und validiert Projektkonfiguration
- Instanziiert Historical-Calibration-Pipeline
- Progress-Events nach `stderr`
- Ergebnis als JSON nach `stdout` und nach `data/<slug>/calibration-runs/<runId>/result.json`
- `--status`: Listet alle Kalibrierungsläufe (ohne neuen Lauf zu starten)
- `--status --run-id <id>`: Detailstatus eines spezifischen Laufs
- `--from`/`--to`: Zeitraum-Override (Standard: letzte 18 Monate)
- `--run-id`: Resume eines unterbrochenen Laufs

#### FA-904: Kommando `isv cache-purge`

```
isv cache-purge --project <slug>
```

- Löscht Verzeichnis `data/<slug>/cache/` vollständig
- Bestätigung über stdout

#### FA-905: Hilfe

```
isv --help
isv <command> --help
```

- Übersicht aller Kommandos und Optionen
- Command-spezifische Hilfe

#### FA-906: NPM-Script Integration

Convenience-Aufruf über pnpm:

```
pnpm cli -- calculate UNICEF-18894 --project unicef
pnpm cli -- calibrate --project unicef --from 2024-10 --to 2026-03
```

---

### 5.10 FA-1000: Web-Oberfläche

#### FA-1001: Technologie

- SvelteKit + Svelte 5
- Tailwind CSS
- Server-seitige Pipeline-Ausführung (SvelteKit Server Routes importieren `@isv/pipelines` direkt)
- Nur lokaler Betrieb (`pnpm dev`), kein Produktions-Deployment

#### FA-1002: Navigation und Layout

Drei-Panel-Layout:
- **Links:** Projekt-Sidebar (Auswahl + Navigation)
- **Mitte:** ISV-Rechner oder Report-Anzeige
- **Rechts:** Kalibrierungskontext (bei Einzelticket-Berechnung)

#### FA-1003: Projekt-Selektor (Sidebar)

- Listet alle Projekte aus `data/*/project-config.json`
- Projekt-Name als Label
- Click-to-Select mit visueller Hervorhebung
- Leerzustand wenn keine Projekte existieren

#### FA-1004: ISV-Rechner (Center Panel)

- Ticket-ID Eingabefeld mit optionalem Prefix-Prefill aus Konfiguration
- "Calculate"-Button löst Pipeline aus
- **Skeleton/Shimmer UI** während Pipeline läuft (30+ Sekunden möglich)
- **Server-Sent Events (SSE)** für Live-Progress
- Anzeige bei Abschluss:
  - Ticket-Metadaten (Titel, Typ, Beschreibung, Subtasks, Kommentare)
  - Per-Repository-Ergebnisse (Miner, Scanner, Health, Gap Analyzer)
  - Commit-Provenienz (SHA, Timestamp pro Repo)
  - ISV-Score (prominent), 6-Faktor-Aufschlüsselung, Formelversion
- Fehler-Anzeige bei Pipeline-Fehler

#### FA-1005: Kalibrierungskontext (Right Panel)

Kontextinformationen für das berechnete Ticket:
- Story Points aus Ticket
- Erfasste Stunden für Ticket/Ticket-Gruppe
- Git-Metriken (LoC, Dateien, Entropie, Komplexität, Intensity)
- LLM-generierter Plausibilitäts-Narrativ
- Graceful Empty State bei fehlenden Daten

#### FA-1006: API-Endpunkte

| Route | Methode | Beschreibung |
|---|---|---|
| `/api/projects` | GET | Projekt-Liste |
| `/api/calculate` | POST | ISV-Berechnung (Body: `{ticketId, projectSlug}`) |
| `/api/calculate/stream` | GET (SSE) | Live-Progress-Events |

---

### 5.11 FA-1100: Kalibrierungsreport und Visualisierung

#### FA-1101: Report-Routing

| Route | Beschreibung |
|---|---|
| `/reports/:project` | Report-Übersicht: Liste aller Reports für ein Projekt |
| `/reports/:project/:report` | Report-Detail: Vollständige Visualisierung eines Reports |

Unterstützung beider Slug-Formate:
- Monats-basiert: `report-YYYY-MM_YYYY-MM`
- Timestamp-basiert: `report-<ISO>_<ISO>`

#### FA-1102: Report-Übersicht (List View)

- Alle verfügbaren Report-Dateien für das Projekt
- Metadaten: Zeitraum, Erstellungsdatum, Stichprobengröße, Fit-Assessment-Badge
- Klick öffnet Detail-Ansicht

#### FA-1103: Executive Summary (Detail View)

Pflicht-Kennzahlen im oberen Bereich:
- Ship Rate (Stunden/ISV)
- Ship Rate ohne Ausreißer
- R² und adjustiertes R²
- DQS
- 95 %-Konfidenzintervall + Standardfehler
- Variationskoeffizient
- Normalitäts-Flag
- Formelversion
- Zeitraum + Stichprobengröße

#### FA-1104: Cluster Scatter Plot

- **Korrekte Benennung:** „Cluster Scatter Plot: ISV-Derived Comparison Value vs. Actual Hours"
- **Verboten:** „Actual vs. Predicted Hours" (impliziert Planungsprognose)
- Interaktiv: Hover über Datenpunkte zeigt Cluster-Details

#### FA-1105: Residuen und Verteilungs-Transparenz

Visualisierung:
- Residuenverteilung (Histogramm)
- Normalitätstest-Ergebnis + p-Wert
- Schiefe und Kurtosis
- Ausreißer-Anzahl und -Prozentsatz
- Ausreißer-Impact auf Ship Rate

#### FA-1106: Faktor- und Feature-Diagnostik

Pro Feature/Faktor:
- Partielle Korrelation
- Standardisierter β-Gewicht
- p-Wert + Signifikanz-Flag
- Formel-Mismatch-Indikatoren

#### FA-1107: Datenqualität und nicht-erfasste Zeit

Explizite Visualisierung:
- Zugeordnete Stunden
- KBV-Stunden
- Unlinked-Overhead-Stunden
- Gesamt-Stunden + DQS-Formel

#### FA-1108: Terminologie-Unterstützung

- Hover-Tooltips auf Fachbegriffen
- Globaler Toggle „Erklärungen anzeigen" (Ein/Aus)
- Glossar-konforme Formulierungen
- Nicht-blockierend, für Experten ausblendbar

#### FA-1109: Cluster-Detail-Drill-Down

- Klick auf Cluster öffnet Detailansicht
- Per-Cluster: ISV-Score, Faktoren, Stunden, Residual, Attribution, Git Changes
- Identifikation warum das Modell bei diesem Cluster fehlschlägt

#### FA-1110: Charting-Bibliothek

- **Empfohlen:** `layerchart` (Svelte-native, Scatter/Distribution/Bar)
- **Fallback:** SVG-basiert (höherer Implementierungsaufwand)

---

### 5.12 FA-1200: Caching und Persistenz

#### FA-1201: File-basierter Cache

- Speicherort: `data/<slug>/cache/<category>/`
- Deterministische Cache-Keys: Zod-Serialisierung + Hash
- Kategorien: `architecture-scanner`, `gap-analyzer`, `static-analysis`, `git-log`

#### FA-1202: SQLite Data Layer

- Aufbau über `isv init --warmup`
- Speichert geparse Tickets + Zeitbuchungen für schnellere Wiederverwendung
- `node:sqlite` (built-in Node.js 24) — zero externe Dependencies
- WAL-Modus für parallele Zugriffe
- Abstrahiert hinter Port-Interfaces (Fallback auf File-basierte Clients)

#### FA-1203: RunStore (Pipeline-Status)

- SQLite-Datenbank: `data/<slug>/calibration-runs/<runId>/store.db`
- Tabelle `runs`: Run-Metadaten (ID, Config, Status, Zeitstempel, Summary)
- Tabelle `clusters`: Per-Cluster-Status (pending/running/done/failed/skipped), Ergebnis-JSON, Retry-Count
- Abstrahiert hinter `RunStore`-Port-Interface

---

### 5.13 FA-1300: Projektkonfiguration

#### FA-1301: Konfigurationsdatei

Jedes Projekt wird über `data/<slug>/project-config.json` konfiguriert:

```json
{
  "project": {
    "name": "<Projektname>",
    "dataFolderName": "<slug>",
    "ticketPrefix": "<PREFIX>"
  },
  "jira": {
    "dataFolderName": "<slug>",
    "ticketPrefix": "<PREFIX>",
    "rawFormat": "jira-xml"
  },
  "git": {
    "dataFolderName": "<slug>",
    "repositories": [
      { "repositoryId": "<id>", "url": "<git-url>" }
    ]
  },
  "timeTracking": {
    "dataFolderName": "<slug>",
    "ticketPrefix": "<PREFIX>",
    "sources": [
      { "rawFormat": "teamleader-pdf|teamleader-excel|projektron-bcs-excel", "subFolder": "<ordner>" }
    ]
  },
  "llm": {
    "provider": "github-copilot-cli",
    "timeoutMs": 240000,
    "stallTimeoutMs": 90000
  },
  "pipeline": {
    "d3QualityFloor": 1,
    "legacyDailyRate": 1000
  }
}
```

#### FA-1302: Multi-Repository-Unterstützung

- Beliebig viele Git-Repositories pro Projekt konfigurierbar (SSH oder HTTPS)
- Jedes Repository hat eine eindeutige `repositoryId`

#### FA-1303: Multi-Source Time Tracking

- Mehrere Zeiterfassungsquellen pro Projekt konfigurierbar
- Verschiedene Formate können parallel genutzt werden
- Jede Quelle hat einen eigenen `subFolder`

#### FA-1304: Health Checks

Pro Client MUSS ein Health Check möglich sein:

| Client | Check | Timeout |
|---|---|---|
| TicketClient | Parse → ≥ 1 Ticket mit korrektem Prefix | < 5 s |
| TimeTrackingClient | Parse → ≥ 1 Zeitbuchung | < 5 s |
| GitClient | `prepare()` pro Repo → ok/fail | < 30 s/Repo |
| LlmClient | Minimaler Prompt (< 50 Token) → nicht-leere Antwort | < 15 s |
| StaticAnalysisClient | `scc` Binary verfügbar | < 2 s |

Aggregierte Ausgabe mit ✅ / ⚠️ / ❌ Symbolen. Exit Code 0 (alle bestanden) oder 1 (Fehler).

---

## 6. Nichtfunktionale Anforderungen

### NFA-01: Performance

- Einzelticket-ISV-Berechnung: < 120 Sekunden bei Standard-Repository-Größe (< 100k LoC)
- Historische Kalibrierung: keine Obergrenze, aber mit Progress-Reporting und Resume-Fähigkeit
- LLM-Timeout: konfigurierbar (Standard: 240 s allgemein, 90 s Stall-Detection)
- Parallele Repository-Verarbeitung MUSS konfigurierbar sein

### NFA-02: Resilienz

- Retry mit exponentiellem Backoff für alle transienten I/O-Operationen (LLM, Git, Netzwerk)
- Standard: 3 Retries, 1 s Basis-Delay; für LLM-Stalls: 4 Retries, ≥ 10 s Basis-Delay
- Checkpoint-basiertes Resume für unterbrochene Kalibrierungsläufe
- SIGINT: Graceful Shutdown (laufende Tasks beenden, State speichern)

### NFA-03: Determinismus und Reproduzierbarkeit

- Die ISV-Formel ist statisch und deterministisch.
- Bei identischem Input (gleicher Code-Stand, gleiches Ticket) MUSS die Valuation Engine exakt das gleiche Ergebnis liefern.
- LLM-Aufrufe verwenden Temperature 0.0–0.1 für maximale Reproduzierbarkeit (nicht garantiert deterministisch).
- Formelversion wird in jedem Output dokumentiert.

### NFA-04: Erweiterbarkeit

- **Adapter-Pattern:** Jeder externe Client (Jira, LLM, Git, Zeiterfassung, Statische Analyse) MUSS hinter einem Port-Interface abstrahiert sein. Neue Adapter MÜSSEN ohne Änderung der Service-Schicht integrierbar sein.
- **Pipeline-Pattern:** Neue Use Cases (z. B. MCP-Server, REST-API, Webhook-Trigger) MÜSSEN als neue Interface-Module hinzufügbar sein, ohne bestehende Pipelines zu ändern.

### NFA-05: Testbarkeit

- Jede Schicht (Domain, Clients, Services, Pipelines, Interfaces) MUSS unabhängig testbar sein.
- Vier-Tier-Teststrategie (siehe Abschnitt 9).
- Mindest-Ziel: > 500 Tests, alle ohne externe Abhängigkeiten (bis auf Tier 4).

### NFA-06: Datenhaltung

- Kein externer Datenbankserver — alle Daten lokal im Dateisystem oder `node:sqlite`.
- Keine Produktions-Deployment-Infrastruktur (kein Docker, kein Kubernetes für MVP).
- Sensible Daten (Projektdaten, Zeitbuchungen) MÜSSEN in gitignored Verzeichnissen liegen.

### NFA-07: Sicherheit

- Keine Credentials in Code oder Konfigurationsdateien (nur in Umgebungsvariablen oder System-Keychain).
- LLM-Zugang über bestehende CLI-Authentifizierung (`gh auth login`).
- Reale Kundennamen DÜRFEN NICHT in committed Dateien oder Fixtures erscheinen.

### NFA-08: Logging und Observability

- Progress-Callbacks mit strukturierten Events
- CLI-Progress nach stderr, Ergebnisse nach stdout
- Per-Cluster-Fehler werden geloggt aber verhindern nicht die Verarbeitung weiterer Cluster
- Kalibrierungsstatus abfragbar über `isv calibrate --status`

---

## 7. Architektur und Technologievorgaben

### 7.1 Schichtarchitektur (Hexagonal / Ports & Adapters)

```
interfaces/ ──► pipelines/ ──► services/ ──► clients/ ──► (extern)
                    │              │              │
                    └──► domain/ ◄─┴──────────────┘
```

| Schicht | Paket | Verantwortung |
|---|---|---|
| **Domain** | `@isv/domain` | Zod-Schemata, Typen, Enums — null Abhängigkeiten |
| **Clients** | `@isv/clients` | Technische Adapter zu externen Systemen |
| **Services** | `@isv/services` | Geschäftslogik pro ISV-Phase (zustandslos) |
| **Pipelines** | `@isv/pipelines` | Use-Case-Orchestrierung |
| **Interfaces** | `@isv/cli`, `@isv/web` | Delivery-Mechanismen (CLI, Web UI) |

**Abhängigkeitsregel:**
- Dependencies fließen nur **einwärts und abwärts**.
- `interfaces/` ruft NIE `services/` oder `clients/` direkt auf — immer über eine Pipeline.
- `pipelines/` ruft NIE `clients/` direkt auf — immer über einen Service.
- `domain/` hat ZERO Abhängigkeiten.

### 7.2 Technologie-Stack

| Concern | Technologie |
|---|---|
| Sprache | TypeScript (strict mode) |
| Runtime | Node.js 24 LTS |
| Package Manager | pnpm (Workspace Monorepo) |
| Schema & Validation | Zod (Source of Truth für Domain-Typen) |
| Module System | ESM-only (`"type": "module"`) |
| Build | `tsc` (Type-Check) + `tsx` (Execution) — kein Bundling |
| Test Framework | vitest |
| Web UI | SvelteKit + Svelte 5 + Tailwind CSS |
| Charts | layerchart (Svelte-native) |
| Datenbank | `node:sqlite` (built-in Node.js 24) |
| Concurrent Queue | p-queue (ESM, ~77 kB) |
| Retry | p-retry (ESM, ~23 kB) |
| PDF-Parsing | pdfjs-dist |
| Subprocess-Management | execa |
| Statistik | Eigene Implementierung (OLS, WLS, Shapiro-Wilk, KS-Test) |

### 7.3 Monorepo-Struktur

```
packages/
├── domain/          # @isv/domain  — Zod-Schemata, gemeinsame Typen
├── clients/         # @isv/clients — Adapter (Git, Jira, LLM, Time Tracking, Static Analysis)
├── services/        # @isv/services — Geschäftslogik (Scanner, Miner, Gap Analyzer, Valuation, Calibration)
├── pipelines/       # @isv/pipelines — Orchestrierung (ISV Calc, Historical Calibration, Shared Utilities)
└── interfaces/
    ├── cli/         # @isv/cli — CLI Entry Points
    └── web/         # @isv/web — SvelteKit Web UI
data/
├── <slug>/          # Gitignored Projektdaten
│   ├── project-config.json
│   ├── tickets/         # Jira XML Exports
│   ├── time-tracking/   # Excel/PDF Zeitbuchungen
│   ├── git/
│   │   ├── repos/       # Bare Clones
│   │   └── work/        # Temporäre Worktrees
│   ├── cache/           # File-basierter Cache
│   ├── calibration/     # Kalibrierungsreports
│   └── calibration-runs/  # Run-spezifische Daten (SQLite, JSONL, Result JSON)
```

### 7.4 Factory- und Dependency-Injection-Pattern

Alle Clients und Services folgen dem Factory-Pattern:
- `createXxxClient(config, cacheConfig?)` → Client oder Cached-Decorator
- `createXxxService(cacheConfig?)` → Service oder Cached-Decorator
- `createXxxFromConfig(config, options?)` → Vollständige Pipeline-Instanziierung mit Cleanup-Handler

---

## 8. Datenmodell und Schnittstellen-Schemata

### 8.1 SystemContext (Architecture Scanner Output)

```typescript
interface SystemContext {
  systemArchetype: "HEADLESS_FRONTEND" | "CMS_DXP" | "MIDDLEWARE" | "BACKEND_SERVICE" | "UNKNOWN";
  archetypeReasoning: string;
  techStack: { languages: string[]; frameworks: string[]; infrastructure: string[] };
  adapterCatalog: {
    inbound: { protocol: string; description: string }[];
    outbound: { systemName: string; integrationType: string }[];
  };
  corePatterns: { category: "FRONTEND"|"BACKEND"|"INTEGRATION"|"CMS"; patternName: string; description: string }[];
  domainModels: string[];
}
```

### 8.2 CodeHealthReport (Status Quo Miner Output)

```typescript
interface CodeHealthReport {
  repositoryRef: RepositoryRef;
  timestamp: IsoTimestamp;
  structuralFacts: {
    volume: { totalLinesOfCode: number; totalFiles: number };
    entryPoints: { controllers: number; views: number };
    gitHotspots: { filePath: string; changeCount: number }[];
  };
  healthScores: {
    complexity: { avgCyclomaticComplexity: number; duplicationPercentage: number; godClassCount: number };
    testHealth: { coveragePercentage: number | null; deadCodeFiles: number };
  };
}
```

### 8.3 GapAnalysisResult (Gap Analyzer Output)

```typescript
interface GapAnalysisResult {
  ticketId: string;
  meta: { isTicketActionable: boolean; reasonIfNotActionable?: string; confidenceScore: number };
  architecturalFit: { canBeImplementedWithExistingPatterns: boolean; summary: string };
  identifiedGaps: {
    data: { hasGap: boolean; missingEntities: string[]; description: string };
    ui: { hasGap: boolean; description: string };
    logic: { hasGap: boolean; description: string };
    integration: { hasGap: boolean; missingAdapters: string[]; description: string };
  };
  requiredModifications: { architectureExtensions: string[]; actionItems: string[] };
  isvScoring: {
    A1_Data: { score: 1|2|3|5; reasoning: string };
    A2_UX: { score: 1|2|3; reasoning: string };
    B1_Logic: { score: 0|1|2|3|5|8; reasoning: string };
    C1_Integration: { score: 1|2|3|5; reasoning: string };
    D3_Quality: { score: 1|2|3; reasoning: string };
  };
}
```

### 8.4 IsvResult (Valuation Output)

```typescript
interface IsvResult {
  formulaVersion: string;     // z.B. "3.4"
  ticketId: string;
  factors: { A1: number; A2: number; B1: number; C1: number; C2: number; D3: number };
  breakdown: { poValue: number; archFactor: number; qualityMultiplier: number };
  isvScore: number;
}
```

### 8.5 ShipUnitCluster (Kalibrierungs-Input)

```typescript
interface ShipUnitCluster {
  clusterId: string;
  ids: string[];
  metadata: { type: string; storyPoints: number | null; timestampT0: IsoTimestamp };
  isvAnalysis: {
    formulaVersion: string;
    isvScore: number;
    confidence: number;
    factors: { A1_Data: number; A2_UX: number; B1_Logic: number; C1_Integration: number; C2_State: number; D3_Quality: number };
    breakdown: { poValue: number; archFactor: number; qualityMultiplier: number };
  };
  metrics: {
    totalHours: number;
    directMatchHours: number;
    splitHours: number;
    dataConfidence: "high" | "medium" | "low";
    gitChanges: {
      linesAdded: number; linesDeleted: number; filesChanged: number;
      distributionEntropy: number; cyclomaticComplexityDelta: number; changeIntensityScore: number;
    };
  };
}
```

### 8.6 CalibrationRunOutput (Kalibrierungs-Output)

Das Gesamtergebnis einer Kalibrierung umfasst:
- `shipRate` (Stunden/ISV)
- `r2`, `adjustedR2`
- `dqs`
- `sampleSize`, `effectiveSampleSize`
- `shipUnitClusters[]` (Detaildaten pro Cluster)
- `clusterResiduals[]` (Actual vs. Predicted pro Cluster)
- `outlierReport` (Ausreißer-IDs, Gründe, Prozentsatz, Ship Rate mit/ohne)
- `normalityAssessment` (Teststatistik, p-Wert, Schiefe, Kurtosis, Flag)
- `reliabilitySummary` (Konfidenzintervall, Standardfehler, CV, DQS)
- `formulaValidation` (Validity Statements, Factor Ranking, Recommendations)
- `factorDiagnostics[]` (Partielle Korrelation, β-Weight, p-Value pro Feature)
- `skippedClusters[]` (IDs und Gründe)

---

## 9. Teststrategie

### 9.1 Vier-Tier-Modell

| Tier | Datei-Muster | Scope | Ausführung |
|---|---|---|---|
| **Tier 1 — Unit** | `*.test.ts` | Einzelne Funktion/Klasse/Schema, kein I/O | `pnpm test` |
| **Tier 2 — Adapter Fixture** | `*.adapter.test.ts` | Adapter + committeter Fixture-Datei | `pnpm test` |
| **Tier 3 — Component Boundary** | `*.boundary.test.ts` | Vollständige Komponente, gemockte Seams | `pnpm test` |
| **Tier 4 — Realworld** | `*.realworld.test.ts` | Reale gitignored Daten, Auto-Skip | `pnpm test:realworld` |

### 9.2 Fixture-Provenienz

- Jede committed Fixture MUSS ihre Herkunft dokumentieren (Quellsystem, Anonymisierung, Generator-Script).
- Mock-Daten in Tier-3-Tests MÜSSEN mit `// derived from:` Kommentar auf Fixture verweisen.
- Reale Kundennamen dürfen nie in Fixtures erscheinen.

### 9.3 Testabdeckungs-Ziel

- Aktuell: > 60 Test-Dateien, > 570 Tests
- Ziel: Jede neue Komponente liefert Tests auf mindestens Tier 1 und dem jeweils relevanten höheren Tier.

---

## 10. Abgrenzungen

Folgende Punkte sind **nicht** Bestandteil dieses Lastenhefts:

| Thema | Status |
|---|---|
| CI/CD-Integration (GitHub Actions, GitLab CI) | Nicht in dieser Phase — spätere Ausbaustufe |
| Jira-Webhook / automatischer Trigger | Nicht im Scope — System wird manuell getriggert |
| REST-API / MCP-Server | Nicht in dieser Phase — als spätere Ausbaustufe vorgesehen |
| Automatische Formel-Anpassung | Explizit ausgeschlossen — immer manueller Human Decision |
| Multi-Tenancy / User Management | Nicht im Scope — Single-User-Betrieb |
| Produktions-Deployment (Docker, Cloud) | Nicht im Scope — lokaler Betrieb |
| Nativerrealtime Jira-API-Anbindung | Nicht im Scope — aktuell XML-Export-basiert |
| Monetäre Bewertung (€-Umrechnung) | Nur als `legacyDailyRate`-Konfiguration; keine vollständige Preiskalkulation |

---

## 11. Glossar

| Begriff | Definition |
|---|---|
| **ISV** | Intrinsic Software Value — dimensionsloses Maß für die strukturelle Komplexität einer Anforderung |
| **Ship Rate** | Empirische Umrechnung ISV → Stunden (abgeleitet aus historischer Kalibrierung) |
| **Ship Unit Cluster** | Logische Gruppierung aus Story/Task + Subtasks als bewertbare Einheit |
| **Fact Finder** | Phase 1: baut den digitalen Zwilling des Codes (Architecture Scanner + Status Quo Miner) |
| **Gap Analyzer** | Phase 2: KI-gestützte Lückenanalyse (Ist vs. Soll) |
| **Valuation Engine** | Phase 3: Deterministische ISV-Berechnung |
| **DQS** | Data Quality Score — Anteil zugeordneter + KBV-Stunden an Gesamtstunden |
| **KBV** | Knowledge-Based Value — gebuchte Stunden ohne Code-Bezug (Meetings, Recherche) |
| **C2 (State Factor)** | Automatisch abgeleiteter Faktor für technische Schulden |
| **T0** | Technologischer Startpunkt — Baseline-Commit vor Beginn der Ticket-Bearbeitung |
| **Bare Clone** | Reines Git-Repository ohne Working Directory (Basis für Worktrees) |
| **Worktree** | Isolierter, temporärer Checkout eines bestimmten Commits |
| **Port Interface** | Abstrakte Schnittstelle im Hexagonal-Architecture-Sinn (austauschbar, testbar) |
| **Adapter** | Konkrete Implementierung eines Port Interface für ein spezifisches externes System |
| **SystemContext** | KI-generierte Architektur-Dokumentation eines Repositories |
| **CodeHealthReport** | Deterministisch erhobene Code-Metriken pro Repository |
| **SystemBaseline** | Aggregierter Ist-Zustand aller Repositories zu einem Zeitpunkt |
| **Residual** | Differenz zwischen tatsächlichen und modell-berechneten Stunden pro Cluster |
| **WLS** | Weighted Least Squares — gewichtete Regression nach Datenqualität |
| **Formelversion** | Kennzeichnung der ISV-Formel (z. B. 3.4) für Nachvollziehbarkeit und Verträge |
