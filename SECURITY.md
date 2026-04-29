# Security Policy

Araon is a localhost-first application that handles brokerage API credentials.
Please treat credential handling, token handling, and realtime market-data
runtime behavior as security-sensitive.

## Sensitive data

Do not commit:

- KIS `appKey`
- KIS `appSecret`
- access tokens
- approval keys
- `data/credentials.enc`
- `data/settings.json`
- SQLite runtime data under `data/`
- local `.env` files

The repository includes `.env.example` for safe local configuration. Real
secrets belong only in your local `.env` file or the encrypted local credential
store.

## Reporting a vulnerability

If GitHub Security Advisories are available for this repository, please use a
private advisory. Otherwise, open an issue with enough detail to reproduce the
problem, but do not include real credentials, tokens, account numbers, or raw
brokerage API responses.

## Local operation reminder

Araon is intended for a trusted single-user localhost environment. Do not expose
the Fastify server or Vite dev server directly to the public internet without
adding authentication, TLS, network controls, and a full production security
review.
