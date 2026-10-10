# Lashbury Cup secure API — cut-over checklist

The production Cloudflare Worker, custom domain, secrets, and private Workers KV namespace are already configured. This checklist is for the existing setup.

**Do not** create another KV namespace, replace production secrets, redeploy the Worker, or import `main:data.json` into production KV as part of this review. The production KV value already contains tournament data, and the Git copy may be stale.

## Already checked
- `https://api.lashbury.co.uk/health` returns `{"ok":true}`.
- An unauthenticated request to `/api/data` is rejected.
- The production Worker is bound to the existing `tournament:data` KV key.
- Secure front-end changes are isolated on the review branch; the live front end has not been switched over.

## Before merging
1. Review the entire pull request and confirm automated checks pass.
2. Test guest, admin, and owner roles in a preview environment. Confirm guest is read-only, admin can score/save, owner can access setup/PIN controls, and logout clears the session.
3. Check mobile Safari and the installed PWA, including navigation, refresh, and offline recovery.
4. Before any production write test, preserve a private recovery copy of the current production KV value using the Cloudflare dashboard or an approved secure method. Never put that copy in GitHub or a public issue.
5. Test an admin edit against production only when ready: make one harmless, reversible change, verify the save succeeds, reload in a fresh session to confirm it persisted, then restore the original value and verify the restoration. Do not test with real scores or results.
6. If any role, save, CORS, session, or PWA check fails, do not merge.

## Cut-over order
1. Publish the reviewed secure front end only after the checks above pass.
2. Verify the live website at `https://lashbury.co.uk`: guest access, admin scoring/save, owner controls, logout, and the installed PWA.
3. Keep `data.json` in the repository until the new front end is live and confirmed not to fetch it. Remove the current public file only after that verification.
4. Treat historical Git cleanup as a separate step. Deleting a file from the latest commit does not remove it from old public commits; rewrite history only with a reviewed backup and recovery plan.

## Security
Never commit PINs, Cloudflare API tokens, session cookies, or exported tournament data. Never paste production secrets into logs, screenshots, issues, or pull requests.
