# WAYWARD CLOUDSAVE WORKFLOW GATEWAY — MANDATORY FIRST READ

This repository is part of the Wayward CloudSave project. Before any task, read this file and all three required policy documents:
1. [Workflow Gateway](docs/WORKFLOW_GATEWAY.md)
2. [Execution Policy](docs/WORKFLOW_EXECUTION_POLICY.md)
3. [Forensic and Verification Policy](docs/FORENSIC_AND_VERIFICATION_POLICY.md)

Preserve MANDATORY_CLOUDSAVE_SPEC.md, protocol compatibility, security constraints, and all existing deployment rules. These global policies supplement, and do not replace, CloudSave-specific contracts.

## Mandatory preflight
Confirm repository, branch, remote, remote HEAD, local HEAD/divergence, worktree changes, recent commits, open PRs/issues/workflows, handoffs, and required permissions. Record a baseline. Never overwrite unrelated or uncommitted work.

## End-to-end ownership
Do not send progress-only updates and wait. Own routine investigation, CI polling, log/artifact retrieval, builds, deployment checks, and independent verification through completion. Continue independent tasks while jobs run. Never delegate checks available through tools.

## Evidence and safety
Derive expected behavior from the CloudSave protocol, official platform/API contracts, and observed evidence—not merely existing tests. Preserve raw failures. No force-push, destructive reset, unauthorized merge, production deployment/mutation, or secret exposure. Keep the static Pages/no-backend architecture and CloudSave ownership constraints intact.

## Completion
Report exact branch and SHA, changed files, checks, CI run IDs, deployment/artifact evidence, and remaining unverified runtime checks. CI success is not proof of real Google login, Drive CRUD, or device compatibility.

## Repository scope restriction — static CloudSave authentication Pages only

This repository is exclusively the hosting and delivery location for the static CloudSave authentication pages. It is **not** a product-development repository, application source-of-truth, experimental workspace, or staging area for WAL/Wayward launcher or game features.

Do not perform general application or feature development here. All such development belongs in the designated WAL Studio development repositories. Changes in this repository are limited to the minimum maintenance strictly required to keep the existing static authentication pages, Pages deployment, bridge protocol, and released-client compatibility working. Preserve the static Pages/no-backend architecture and existing public URLs.
