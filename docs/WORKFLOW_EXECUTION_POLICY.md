# WORKFLOW EXECUTION POLICY

- Own routine investigation and execution through verified completion. Never stop after a summary, job launch, build, upload, or deployment.
- Track async run IDs, poll them, inspect logs/reports/artifacts, diagnose failures, fix in-scope causes, and rerun the smallest sufficient set.
- While jobs run, perform independent safe work. Reuse evidence; avoid idle waiting and redundant broad reruns.
- Never send progress-only updates and wait. Do not delegate repository checks, CI/log retrieval, artifact inspection, or deployment verification when tools allow.
- Verify artifact existence, contents, size, integrity, and downloadability. A deployment message is not proof that the deployed page or asset is accessible.
- Preserve CloudSave's static Pages/no-backend architecture, protocol compatibility, security boundaries, and existing project work. No force-push, destructive reset, unauthorized merge, release, production deployment/mutation, or secret exposure.
- Report branch/SHA, changed files, exact checks, CI IDs, deployed URL and verified behavior, unperformed runtime checks, and blockers. Never claim unobserved success.
