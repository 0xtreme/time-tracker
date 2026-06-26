# Hosting Decision

## Recommendation

Use GitHub Pages for the current version.

The app is static, local-first, and does not use protected server routes, serverless functions, background jobs, or a database. GitHub Pages is enough for this shape and keeps the operational surface small.

## GitHub Pages Fit

GitHub Pages is appropriate when:

- the app is public and static,
- storage is browser-local,
- there is no OAuth callback route,
- there are no server-side secrets,
- the project can be built into static files.

Important constraints:

- GitHub Pages is not a backend.
- It should not be used to store private user time logs.
- Public repositories are the simplest free-path deployment.

## Vercel Fit

Use Vercel when the app needs:

- authenticated storage,
- OAuth or SSO callbacks,
- server functions,
- private preview URLs,
- environment-managed secrets,
- integration with a managed database.

For this app, Vercel would be useful only after the product adds optional cloud sync or user accounts.

## Optional GitHub-Backed Storage

Writing user data to a file in GitHub through OAuth is possible, but it is not the recommended first step. It introduces token handling, repository permissions, merge conflicts, auditability questions, and a privacy surface that is larger than the current need.

A safer next version would use a purpose-built backend with explicit user accounts and a database, or a personal export/import workflow for users who want portability without accounts.
