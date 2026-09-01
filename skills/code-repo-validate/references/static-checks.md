# Static Validation Reference

Use this reference after the README gate and stack detection. Work every applicable row and record direct evidence. A path or folder name alone is not proof that the implementation is correct.

## Checklist

| ID | Area | Requirement | Verification | Fail when |
|---|---|---|---|---|
| S01 | Repository identity | Repository name follows `coderepo-{frontend}-{backend}-{appname}`. | Inspect directory name and Git remote. | Naming is inconsistent, ambiguous, or contains spaces. |
| S02 | Complete monorepo | Frontend, backend, database config, seed data, setup, root commands, README, debugger config, and `hackerrank.yml` exist. | Open representative files and confirm referenced paths exist. | A required product or operation layer is missing. |
| S03 | README contract | Root README contains every section required by the guideline and agrees with the repository. | Build a section checklist and compare commands, ports, stack, credentials, paths, and features with source. | README is absent, vague, placeholder, incomplete, or inaccurate. |
| S04 | Bun workspace | Root `package.json` and `bun.lock` define the JavaScript workspaces; no competing lockfile exists. | Inspect workspace configuration and tracked lockfiles. | Workspace installation is fragmented or another JavaScript lockfile is committed. |
| S05 | Declared stack | Manifests, build files, source imports, environment examples, and commands agree. | Record actual frontend, backend, database, runtime, state, and HTTP choices. | Documentation or commands describe a different stack, or a stack replacement was introduced. |
| S06 | Dependency freeze | Dependency changes do not expand the approved surface. | Diff every manifest and lockfile against the selected baseline; trace remaining dependencies to real imports or build use. | An unapproved dependency was added or replaced, or an unused dependency remains. |
| S07 | Feature architecture | Code is grouped by product domain using native framework conventions; HTTP, business, and persistence concerns are separated. | Trace at least one read and one write feature through all layers. | Features are scattered by layer, business rules live in handlers, or persistence leaks across boundaries. |
| S08 | MongoDB contract | MongoDB URI and existing driver are used consistently; no relational persistence is introduced. | Inspect manifests, connection config, models/documents, repositories, and environment examples. | SQL, a relational ORM, or substitute persistence is present. |
| S09 | Seed reset design | Seed logic clears application collections and inserts a deterministic baseline; full start invokes it. | Inspect seed entrypoint, seed data, setup script, and root start lifecycle. | Seed is partial, append-only, nondeterministic, or disconnected from start. |
| S10 | Environment setup | `.env.example` files exist, local files are ignored, and setup creates missing local files. | Compare examples, setup logic, ignore rules, and application config reads. | Secrets are committed, manual edits are required, or config names disagree. |
| S11 | HackerRank config | YAML parses and declares valid install, run, read-only, and default-open paths. | Parse YAML and resolve every referenced command and path. | YAML is invalid, a path is absent, or declared commands are not the real product flow. |
| S12 | Ports and reload | Frontend uses 3000, backend uses 8000, API proxy/base agrees, and existing development reload is configured. | Inspect Vite config, backend config, root commands, and environment examples. | Ports conflict, bindings are unreachable, proxy is wrong, or reload requires a new package. |
| S13 | Platform compatibility | Core features do not require unavailable external capabilities or services. | Trace feature flows, environment values, network clients, and media references. | Product completion depends on outbound services, external media, or unsupported runtime behavior. |
| S14 | Frontend integration | Every README feature has a real frontend surface and API call with applicable state handling. | Map components to API-client methods and inspect loading, empty, validation, disabled, and error paths. | UI uses substitute data, omits the API, or lacks necessary recovery handling. |
| S15 | Backend integration | Every README feature has a route, handler, business path, persistence path, and consistent errors. | Map API clients to routes, controllers, services, repositories, and shared error handling. | A route is unimplemented, dead, unauthenticated unexpectedly, or bypasses persistence boundaries. |
| S16 | Code quality | Source is formatted and free of dead code, unused dependencies/imports, generated output, and temporary debugging. | Run existing formatting checks where available and inspect suspicious files/logging. | Product source or dependency graph contains verified residue or inconsistent formatting. |
| S17 | Content and media | Media is local and owned by the appropriate application layer; seed content is coherent and credentials match README. | Inspect asset references, URLs, seed identities, and authentication configuration. | Runtime media is externally hosted, content is placeholder/inappropriate, or credentials do not work by design. |
| S18 | Git and archive | Ignore/export rules are correct; README is exported; internal docs/skills are not; archive is below 5 MB. | Inspect `.gitignore` and `.gitattributes`, create a Git archive, list entries, and measure bytes. | Local/generated data is tracked, export contents are wrong, or size exceeds the limit. |
| S19 | Debugger | `.vscode/launch.json` uses real commands, source paths, runtime, and backend entrypoint. | Parse JSON and resolve every path and command. | Configuration points to missing files, wrong ports, or obsolete commands. |

## Baseline selection

Use the baseline named by the user. If none is provided, select the most appropriate upstream source branch and state the choice in the report.

Do not compare only `package.json`. Review every dependency declaration and lockfile relevant to the detected stack.

A changed manifest or lockfile is not automatically a failure. Dependency removal and lockfile normalization are allowed when they do not add or replace the approved technology. Record the exact additions, removals, and replacements.

## README gate procedure

Create a short checklist for the eleven required README areas in the guideline. Verify each claim against source or configuration before marking S03 `PASS`.

Build the feature inventory only from concrete product capabilities in the README. Supporting qualities such as responsive styling should not become an artificial backend feature row, but their source implementation may still be reviewed under S14.

If the README fails, do not infer missing feature documentation from the code. Continue inspecting the repository, record the missing content precisely, and keep the overall readiness verdict failed.

## Feature mapping procedure

For each README feature, record the following static path before runtime validation:

| Field | Evidence to capture |
|---|---|
| Product outcome | The specific user capability stated in the README. |
| Frontend surface | Page, view, component, drawer, dialog, form, or control. |
| Frontend request | API client method, request path, method, and payload/query construction. |
| Backend entry | Route and controller or handler. |
| Business path | Service or equivalent domain logic. |
| Persistence path | Repository/model/document and MongoDB collection. |
| State handling | Relevant loading, empty, validation, authorization, disabled, success, and error behavior. |

Fail disconnected or substitute implementations. Hardcoded fallback, mock, sample, placeholder, or in-memory data cannot stand in for a required API response.

## Code-quality interpretation

Distinguish temporary debugging output from intentional lifecycle logging. Setup progress, server start, database connection, and operational error messages are allowed when they help an operator understand the application state.

Do not require a new linting, formatting, or analysis dependency. Use existing tools and direct inspection.

## Archive procedure

Create the archive from the commit or staged tree being validated. Confirm:

- `README.md` is present;
- `docs/` is absent;
- `skills/` is absent;
- ignored local environments, caches, databases, logs, and build output are absent;
- total archive size is below 5 MB.

Record the measured byte size and the relevant archive entries in the report.
