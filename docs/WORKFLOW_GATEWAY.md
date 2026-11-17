# WORKFLOW GATEWAY — REQUIRED PROCEDURE

Applies to every task and branch. Read root AGENTS.md, this document, WORKFLOW_EXECUTION_POLICY.md, FORENSIC_AND_VERIFICATION_POLICY.md, and relevant nested instructions. Preserve MANDATORY_CLOUDSAVE_SPEC.md, protocol versions, static Pages architecture, security requirements, and deployment ownership.

## Mandatory preflight
Confirm repository, branch, remote, remote HEAD, local HEAD/divergence, worktree changes, recent commits, PRs/issues/workflows, handoffs, nested instructions, task scope, ownership, and permissions. Record a baseline. Never overwrite unrelated work.

## Evidence and change control
Record claim → evidence/source → confidence/status → action. Preserve raw failure evidence. Establish expected behavior independently from authoritative CloudSave protocol and platform/API contracts. Make the smallest root-cause fix. No unrelated refactors, force-push, destructive reset, unauthorized merge, release, deployment, production mutation, or secret exposure.

## Completion
Investigate → derive expected behavior → implement → focused checks → integration/CI → build/package → inspect artifacts → verify final repository state and runtime evidence → report. Track async jobs and perform independent work in parallel.

## Exceptions
For genuine credential, permission, quota, hardware, or approval blockers, identify exact evidence; finish all independent work.
