# Generated Installer Smoke Test Strategy

- Status: Accepted
- Created: 2026-07-08T04:00:00Z

## Context

`installerer` generates installers for GitHub Release assets. A generated installer is only fully validated when it downloads release assets, verifies checksums, extracts the configured binary, places it in the install directory, and runs the installed binary on an actual target runner.

Existing approaches such as testing against a fixed test release or the current latest release are insufficient as the primary CI strategy:

- A fixed test release can prove that some historical installer path works, but it does not verify the current build outputs.
- A latest release smoke test exercises a user-facing path, but it is not a stable pre-release gate because the latest release can change independently of the current workflow run.
- GitHub Actions artifacts are useful for moving build outputs between jobs, but they are not a substitute for the GitHub Release asset contract that generated installers consume.

This ADR records the decision from [Issue #118](https://github.com/tooppoo/installerer/issues/118).

## Decision

Generated installer smoke testing uses a temporary published prerelease and pinned install path.

A consuming repository builds release assets and a checksum file, publishes them to a temporary prerelease with a CI-only tag, then runs the generated installer with:

```sh
sh install.sh --version "<ci-tag>" --install-dir "<tmpdir>"
```

The smoke test then executes the installed binary's version command, typically:

```sh
"<tmpdir>/<binary.name>" --version
```

The initial design does not provide multiple smoke-test modes. Latest-install verification and existing-tag verification are intentionally out of scope for the first implementation.

## Public API Shape

`installerer` does not expose a full reusable workflow as the primary public API for this feature.

Instead, `installerer` provides:

1. a step-level per-target smoke-test action, and
2. CLI commands that generate and check a repository-owned GitHub Actions workflow.

The step-level action verifies one target on the current runner. It does not create releases, upload release assets, delete releases, or delete tags.

The generated workflow remains visible in the consuming repository. It is reviewed and committed by that repository, and it owns repository-specific lifecycle concerns such as build jobs, permissions, prerelease creation, asset upload, cleanup, triggers, scheduling, and concurrency.

## Workflow Generation And Contract Checking

`installerer` provides workflow generation and workflow checking commands, conceptually:

```sh
installerer actions workflow generate \
  --config installerer.kdl \
  --actions-config installerer.actions.kdl \
  --output .github/workflows/installer-smoke.yml

installerer actions workflow check \
  --config installerer.kdl \
  --actions-config installerer.actions.kdl \
  --workflow .github/workflows/installer-smoke.yml
```

The exact actions config schema is defined by follow-up implementation work.

The generated workflow is not treated as a byte-for-byte generated artifact. Instead, `installerer actions workflow check` parses the workflow YAML and validates only the semantic contract that `installerer` is responsible for.

Contract-managed items include:

- target matrix derivation from installer config targets,
- smoke action invocation,
- prerelease / smoke / cleanup job graph,
- least-privilege direction for installer-managed jobs,
- cleanup behavior,
- unique CI tag use,
- pinned install via `--version <ci-tag>`.

Repository-local workflow concerns are intentionally outside the check, including triggers, schedules, concurrency, unrelated jobs, build job internals, notification steps, formatting, comments, and non-installerer action updates outside the installer smoke-test contract.

## Prerelease And Immutable Release Constraints

The CI prerelease tag must be unique per workflow run attempt. The workflow must not rely on deleting a tag and later recreating the same tag name.

This avoids relying on tag reuse, which is especially important for repositories that use immutable releases where deleted release or tag names may not be reusable.

Cleanup is still attempted, but cleanup failure must be reported clearly rather than silently ignored.

## Renovate And Dependabot Compatibility

Generated smoke-test workflows are repository-owned workflows, not opaque external reusable workflows.

The semantic contract check is chosen instead of a whole-file diff check to reduce conflict with Renovate, Dependabot, formatting changes, and repository-local workflow customization.

Dependency update bots may update unrelated workflow parts. The workflow check should fail only when a change violates the installer smoke-test contract, such as changing the smoke action invocation, target matrix, required job dependencies, or required permissions.

## Alternatives Considered

### Full Reusable Workflow As The Primary API

A full reusable workflow could hide most orchestration details behind `jobs.<id>.uses`.

This is not selected as the primary API because prerelease creation, permissions, cleanup, artifact layout, notification risk, triggers, runner policy, and build integration are repository-specific concerns. Hiding them in an external workflow would make adoption and review harder for consuming repositories.

### User-Defined Matrix Only

Consuming repositories could manually define the matrix and call a step-level smoke action.

This is not selected as the sole approach because the distribution targets already exist in installer config. Manually duplicating them in workflow YAML creates drift risk: a configured target might be omitted from CI, or an unsupported target might be tested.

### Byte-For-Byte Generated Workflow Diff

The generated workflow could be checked by regenerating it and comparing the whole file exactly.

This is not selected because it would conflict with repository-local workflow customization, formatting changes, comments, Renovate, and Dependabot. The important property is not whole-file identity but preservation of the installer smoke-test contract.

### Latest Install As The Primary Smoke Test

The smoke test could omit `--version` and verify the latest-install path.

This is not selected for the initial pre-release gate because latest release resolution is intentionally time-dependent. It is better treated as a separate post-release verification path.

## Consequences

### Positive Consequences

- The smoke test verifies the GitHub Release asset path used by generated installers.
- The test uses pinned install, avoiding latest-release instability as a pre-release gate.
- The consuming repository keeps release lifecycle, permissions, cleanup, and build integration visible.
- Matrix generation can stay aligned with installer config targets.
- Workflow contract checking reduces drift without requiring whole-file identity.
- Renovate and Dependabot can update unrelated workflow parts without necessarily breaking the contract check.
- The design avoids relying on tag reuse, which is safer for immutable release environments.

### Negative Consequences

- A temporary published prerelease can produce notification noise for users watching releases.
- The feature requires additional CLI surface for workflow generation and contract checking.
- A separate actions config may be needed for workflow-generation concerns that do not belong in installer config.
- Cleanup failure must be handled explicitly.
- The workflow contract checker must parse and reason about a constrained subset of GitHub Actions YAML.

### Neutral Consequences

- Latest-install smoke testing is deferred to later work.
- Full reusable workflow support may be reconsidered later, but it is not the initial primary API.
- Detailed actions config schema, runner mapping defaults, release asset upload layout, and exact contract-check rules are split into implementation issues.
