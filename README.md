# Entrenamiento

Entrenamiento is a private, serverless personal training planner built with semantic HTML, modern CSS, and vanilla JavaScript. It runs entirely in the browser, requires no account, and keeps progress on the user's device.

The interface is written in Spanish and uses one neutral local profile.

## Canonical libraries

The application has two closed, document-driven catalogs:

- 91 exercises and cardio protocols, identified internally as E01–E91.
- 49 general routines, identified internally as R01–R49, with complete coverage of E01–E91.
- 48 complementary HIIT routines, identified as H01–H48.

Routine sequences, prescriptions, optional positions, editorial duration bands, logistics, and taxonomy come from the supplied **Biblioteca final de rutinas** and **Biblioteca final de rutinas HIIT complementarias** documents, extended with the requested walking exercise and three continuous walking sessions. Public protocol durations are calculated from their executable phases so they cannot drift from the player. H01–H48 supplement rather than replace R01–R49.

The selector starts with the catalog and then exposes only the taxonomy available in it. General routines use:

1. Objective (`OBJ`)
2. Region (`REG`)
3. Equipment (`EQ`)
4. Duration (`DUR`)
5. Level (`NIV`)

The selector can then refine general results with movement pattern (`PAT`), station (`EST`), format (`FORM`), and logistics changes (`LOG`). HIIT routines use type (`TIPO`), equipment (`EQ`), region (`REG`), pattern (`PAT`), format (`FORM`), level (`NIV`), duration (`DUR`), logistics changes (`LOG`), and complementarity (`COMP`). Taxonomy codes remain internal; every public duration represents the complete session, including warm-up, the main block, recoveries, transitions, and cool-down.

## Features

- Day-aware dashboard and manual weekly calendar.
- Three editable weekly presets prioritizing upper body, lower body, or high-intensity conditioning and weight loss.
- R01–R49 and H01–H48 routine selector with reactive taxonomy counts.
- Routine detail with the exact sequence, dose, rest, and logistics text.
- Resumable, set-by-set workout player with a session clock, work timers, automatic rest countdowns, editable documented set ranges, and clear safety cues.
- Per-exercise diary for exact dumbbell or kettlebell weight, band color and quantity, rowing damper, repetitions, timed work, repetitions left in reserve, and perceived effort; the latest record and its recommendation to raise, maintain, or lower the load are shown next time.
- A canonical phase-by-phase execution model for HIIT, rowing, and walking sessions, with selectable documented variants, exact countdowns, manual completion for distance or repetition targets, and an auditable breakdown of warm-up, active work, recovery, transitions, and cool-down.
- E01–E91 exercise library with anatomy, equipment, technique, and safety metadata.
- Exercise filters for muscle group, specific muscle, equipment, and documented difficulty.
- Verified exercise illustrations where an exact match exists and explicit documentary placeholders otherwise.
- Visual equipment catalog for the available SmartBells, kettlebell, bench, attachments, bands, anchors, and Echo Rower.
- Weekly history, streaks, completion totals, and an eight-week activity chart.
- JSON backup import and export.
- Responsive navigation, keyboard support, focus states, and reduced-motion support.
- Local Lucide 1.31.0 icons with no runtime network dependency.

## Technology

- HTML5
- CSS3
- Vanilla JavaScript
- Browser `localStorage`

There is no backend, framework, analytics service, compilation step, or required runtime network request.

## Deployment

The production site is published automatically through the repository's GitHub Pages environment from the default branch. Only owner-authored pushes to `master` and owner-triggered manual runs can execute the quality and deployment pipeline. A push is deployed only after the static, unit, browser, data-management, and production-artifact gates pass, using the exact artifact exercised by Chrome.

All workflow dependencies are official GitHub Actions pinned to immutable commit SHAs. Checkout credentials are never persisted, the default workflow token is read-only, and only the deployment job receives the narrowly scoped Pages and OIDC permissions it needs. The published artifact contains only `index.html`, `css/`, `js/`, and `public/`; tests, source documents, and repository tooling are excluded.

Build and validate the exact static artifact locally with:

```bash
npm run build:pages
```

## Getting started

Open [`index.html`](index.html) in a modern browser. The project can also be deployed unchanged to any static host.

## Project structure

```text
index.html                         Application shell and dialogs
css/styles.css                     Design system and responsive components
js/data.js                         Profile, persistence version, and inventory
js/exercises.js                    Exercise library E01–E91
js/routines.js                     General routine library R01–R49
js/hiit-routines.js                Generated complementary H01–H48 library
js/session-model.js                Canonical protocol timelines, duration variants, phase cues, and strength rests
js/planner.js                      Catalog compilation, validation, sessions, and facets
js/workout.js                      Prescriptions, protocol execution, inventory-safe logs, timers, and resumable state
js/state-io.js                     Versioned backup creation and validated legacy-compatible import
js/app.js                          Rendering, interaction, and persistence
scripts/import_exercise_library.py Markdown-to-JavaScript exercise importer
scripts/import_routine_library.py  Markdown-to-JavaScript routine importer
scripts/import_hiit_library.py     Markdown-to-JavaScript HIIT importer
scripts/build_pages.py             Allowlisted and validated production artifact builder
scripts/run_browser_tests.py       Self-contained local Chrome gate runner
tests/planner.test.js              Source-truth and integration validation
tests/workout.test.js              Workout engine, history, inventory, and timer validation
tests/state_io.test.js             Backup format, limits, compatibility, and isolation validation
tests/repository_security.test.js  Repository policy and workflow supply-chain validation
tests/browser_smoke.py             Chrome interaction and responsive-layout smoke test
tests/data_actions_browser.py      End-to-end export, import, print, and reset validation
docs/patron-imagenes-ejercicios.md Visual contract and anatomical QA checklist
js/vendor/lucide.min.js            Local Lucide browser distribution
public/exercise-images/            Verified exercise illustrations
public/equipment-images/           Equipment imagery
.github/SECURITY.md                Private vulnerability-reporting policy
.github/workflows/                 Owner-only CI, CodeQL, and GitHub Pages automation
```

## Document import utilities

The three importers parse and validate the original supplied document cores (E01–E90, R01–R46, and H01–H48). Their standard output is a review artifact, not a drop-in replacement for the runtime files: the live catalogs also contain the explicitly requested walking extension and UI-ready canonical names, while `js/session-model.js` is the single source of truth for executable timelines, phase cues, full-session duration variants, and explicit strength rests. Reconcile those layers and run every gate before replacing a runtime catalog.

Runtime validation rejects missing E01–E91, R01–R49, or H01–H48 records. General routine coverage must remain 91/91; HIIT protocols keep only the exercise references explicitly present in their definitions.

## Validation

```bash
npm test
```

Validation checks syntax, all 97 exact routine identifiers and titles, seven high-intensity equipment families, 91/91 general coverage, 91/91 exercise-image assignments, protocol and exercise prescriptions, optional items, taxonomy filter counts, the three weekly presets, session preservation, equipment references, inventory-safe selections, timer restoration, performance history, hardened state migration, and application load order. It also verifies every protocol variant, phase total, exercise reference, explicit strength rest, immutable workflow dependency, owner-only trigger, repository privacy policy, and the regressions that previously interpreted identifiers or bench angles as seconds.

The separate Chrome smoke gates exercise the full strength and interval workflows, data-management actions, all five routes at ten viewport widths from 320 to 1440 pixels, and every exercise and routine detail. They also reject horizontal overflow, internal identifiers, inaccessible actions, unlabeled fields, missing image alternatives, and visible text below 12 pixels.

With the app served at `http://127.0.0.1:4173/` and a local Chrome debugging endpoint on port `9223`, run both browser gates with:

```bash
python3 tests/browser_smoke.py
python3 tests/data_actions_browser.py
```

For the same self-contained production run used by continuous integration, install the development dependency and use:

```bash
python3 -m pip install --require-hashes -r requirements-dev.txt
npm run test:pages
```

## Repository security

The public repository remains readable and forkable under GitHub's public-repository model, but it grants no external write or deployment path. Repository settings restrict pull-request creation to collaborators, and the only collaborator is the owner. Issues, Projects, Wiki, and Discussions are disabled; deploy keys, webhooks, repository secrets, and pending invitations are absent.

Active rulesets prevent deletion and force-pushes on `master`, while a separate update restriction reserves normal pushes to the repository owner. GitHub Pages accepts deployments only from `master`. Secret scanning, push protection, dependency vulnerability alerts, private vulnerability reporting, and weekly CodeQL analysis are enabled.

## Data and privacy

Progress is stored under the `entrenamiento.training.v1` key in `localStorage`. Existing data under the previous key is migrated automatically. The application does not transmit personal data. Users can export and import a JSON backup from **Datos y preferencias**.

This application provides general fitness information and is not a substitute for individualized medical advice. Stop exercising and seek appropriate guidance if pain, dizziness, or unusual symptoms occur.
