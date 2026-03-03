# Intrinsic Software Valuation

A documentation-first project for defining and evolving an Intrinsic Software Valuation (ISV) engine.

## Purpose

This repository captures the conceptual model, methods, and evolution path for estimating the intrinsic value of software systems.

The goal is to create a transparent, explainable valuation framework that can be:
- understood by technical and non-technical stakeholders,
- extended in small, documented steps,
- validated against historical and practical scenarios.

## Overview

Current content is documentation-centric and organized in `docs/`:

- `docs/concept/` — core ISV concepts and method chapters
- `docs/architecture/` — architecture-related material and design decisions

The `concept` series currently includes:
- Big Picture
- Architecture Scanner
- Status Quo Miner
- Gap Analyzer
- Valuation
- Historical Calibration
- Glossary

## Usage

Use this repository as a reference and collaboration space for ISV method development.

Typical usage patterns:
- Read the conceptual chapters in `docs/concept/` from `00` upward.
- Discuss assumptions, definitions, and scoring logic via pull requests.
- Add or refine chapters and supporting docs incrementally.

### How to contribute new content

1. Find the target folder (or create a new one).
2. Ensure the folder has a `README.md` with:
   - folder purpose,
   - content overview,
   - navigation hints.
3. Add or update documents in small, reviewable changes.
4. Follow collaboration rules in `CONTRIBUTING.md`.

## Status

This repository currently does **not** define a fixed implementation tech stack. It is focused on domain concepts, structure, and shared language first.

For conventions and contribution workflow, see:
- `CONTRIBUTING.md`
- `AGENTS.md`
