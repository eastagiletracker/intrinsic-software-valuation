# data

Local data directory for the ISV Engine (gitignored).

## Purpose

Store local, unversioned data files used by the ISV Engine — primarily raw time tracking exports for the Historical Calibration pipeline.

## Contents Overview

This folder is intentionally gitignored. It may contain:

- Time tracking exports (PDF, Excel, CSV, JSON) for calibration
- Temporary pipeline artifacts
- Local test data

## How to Use

- Place raw time tracking files here for the `time-tracking` client to parse.
- Do not commit data files — this folder is listed in `.gitignore`.

## Data Format

See `docs/concept/ISV Engine - 03 - Historical Calibration.md` for the expected time entry format and parsing rules.
