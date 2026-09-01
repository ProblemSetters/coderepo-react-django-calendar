# Code Repo Validate: Adoption and Use Manual

## What this toolkit provides

The Code Repo toolkit has two complementary parts:

- `docs/HackerRank-Code-Repo-Guidelines.md` is the product and repository acceptance contract used while an application is being created.
- `skills/code-repo-validate/` is a read-only audit workflow used after implementation and documentation are complete.

The skill does not build the product, invent missing features, write the README, fix failures, or edit tracked product content. It inspects the delivered product, runs its declared commands, exercises its APIs, verifies MongoDB behavior, and reports evidence. Declared commands may create ignored local environment, cache, and build artifacts.

## When to use the skill

Use the skill:

- after the full application and README are complete;
- before HackerRank handover;
- after a material product, dependency, setup, or runtime change;
- after fixing reported failures, to rerun the complete acceptance flow.

Do not use the skill to decide what product to build, generate missing documentation, implement unfinished features, or silently repair the repository during review.

## Toolkit layout

```text
docs/
└── HackerRank-Code-Repo-Guidelines.md    Product and acceptance requirements

skills/code-repo-validate/
├── SKILL.md                              Audit entrypoint and workflow
├── SKILL-MANUAL.md                       Adoption and operator guide
└── references/
    ├── static-checks.md                  Repository, stack, and source checks
    ├── runtime-checks.md                 Install, build, start, API, and DB checks
    └── report-format.md                  Required report structure and writing rules
```

Preserve these relative paths. `SKILL.md` resolves the guideline through `../../docs/`.

## Creating a new Code Repo application

### Step 1: Add the toolkit

Copy the complete `docs/` and `skills/` folders into the application repository. Keep the root README outside those folders.

Configure `.gitattributes` so internal `docs/` and `skills/` are excluded from the HackerRank archive while the root `README.md` remains included.

### Step 2: Use the guideline as the build contract

Read `docs/HackerRank-Code-Repo-Guidelines.md` before implementation decisions are made. Use it to define:

- the complete product boundary;
- frontend-to-backend feature ownership;
- the approved existing stack and dependency freeze;
- repository architecture and required operational files;
- deterministic install, seed, and start behavior;
- HackerRank ports and configuration;
- product-quality and acceptance expectations.

Do not use the guideline to migrate a repository to a preferred framework. Detect and preserve the technology already declared by that repository.

### Step 3: Write the root README

Create the README as a product document and operator walkthrough. It must explain:

- what the application is and who it serves;
- concrete end-to-end features;
- actual technologies and their roles;
- annotated project structure;
- prerequisites and MongoDB behavior;
- install, start, seed, and development commands with their purposes;
- seeded credentials;
- how maintainers use the guideline and validation skill.

The README becomes the validation feature inventory. A missing, vague, placeholder, or inconsistent README is an automatic `FAIL`; the skill will not reconstruct it from source.

### Step 4: Complete the application

Finish every README capability across frontend, backend, API wiring, validation, and MongoDB persistence. Confirm the declared HackerRank install and run flow is the real application flow.

Do not invoke the validation skill as a substitute for unfinished implementation.

## Running validation with Codex or Claude Code

Open the completed repository in Codex or Claude Code and use this prompt. The workflow is plain Markdown, so either coding agent can follow the same repository-local instructions.

```text
Read and follow skills/code-repo-validate/SKILL.md to validate this complete Code Repo application against docs/HackerRank-Code-Repo-Guidelines.md. Run the in-scope static, install, build, start, API, and MongoDB checks, then write the report outside the repository.
```

## What the coding agent does during the audit

1. Records the branch, commit, working-tree state, baseline, and occupied ports.
2. Reads the guideline and checks the required README.
3. Detects the actual frontend, backend, database, package manager, and build tools.
4. Runs the complete static checklist, including dependency and archive review.
5. Runs the exact HackerRank install and run commands.
6. Builds the frontend and performs the backend's native compile or configuration check.
7. Verifies frontend and backend readiness on ports `3000` and `8000`.
8. Exercises authentication, representative feature APIs, validation paths, and MongoDB persistence.
9. Restarts the application and confirms the seed baseline is restored.
10. Stops only the processes it started and confirms the working tree is unchanged.
11. Writes an evidence-backed report outside the repository.

## Reading the report

| Verdict | Meaning | Expected response |
|---|---|---|
| `PASS` | Direct evidence proves the requirement. | No action required. |
| `FAIL` | Direct evidence proves a defect or contract violation. | Fix the stated outcome, then rerun validation. |
| `MANUAL` | Local infrastructure prevented direct verification. | Run the exact supplied steps in a suitable environment. |
| `N/A` | The requirement does not apply to the detected stack or product. | Confirm the explanation is accurate. |

The report contains a repository-level results table and a feature-level acceptance matrix. The repository is ready only when no unresolved `FAIL` remains and every `MANUAL` item is intentionally accepted or subsequently verified.

## Fix and rerun workflow

Validation is deliberately read-only with respect to tracked product content. After reviewing the report:

1. Make fixes in a separate implementation pass.
2. Update the README when the delivered product scope changes.
3. Rerun the complete skill rather than only the previously failing command.
4. Compare the new report with the previous failures.
5. Keep the final evidence outside the application repository.

This separation keeps product changes reviewable and prevents the validator from altering the repository it is measuring.
