# FORENSIC AND VERIFICATION POLICY

Existing implementation, tests, historical behavior, and green CI are not ground truth. Derive expected behavior from authoritative CloudSave protocol definitions, official browser/Google APIs, platform contracts, and observed evidence.

## Investigation
Preserve exact reproduction conditions and raw logs/network traces. Identify origin, opener, app ID, nonce, request/attempt/session IDs, MessagePort lifecycle, browser, version, timestamp, and failing operation as applicable. Trace validation, message transfer, token delivery, popup/redirect, Drive API calls, persistence, and result. Separate observations from hypotheses; test each; fix root cause.

## Test-oracle review
Classify tests as Valid, Insufficient, Invalid oracle, Duplicate, or Environment-dependent. A test is insufficient if it copies implementation logic, checks only invocation/non-null, omits security/failure paths, or mocks away browser/account behavior.

## Evidence levels
Report separately: source inspection; unit/static contract tests; integration tests; build; CI; Pages deployment; deployed-page accessibility; real Google sign-in; real Drive CRUD; browser popup/MessagePort behavior; real device/runtime. Lower-level success never proves higher-level behavior. Never present mocks as live account or production proof.

For origin validation, token handling, OAuth, CSP, redirect behavior, privacy, and Drive access, inspect both success and failure paths and label unavailable live checks.
