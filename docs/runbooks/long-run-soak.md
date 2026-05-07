# Long-run reliability soak

Araon includes a no-live soak harness for repeated local health checks.

```bash
npm run soak:no-live -- --duration-ms 60000 --interval-ms 5000
```

The harness starts Araon with a fresh temporary data directory and no KIS
credentials. It polls:

- `GET /credentials/status`
- `GET /runtime/realtime/status`
- `GET /runtime/data-health`
- `GET /runtime/signals/outcomes`
- `GET /runtime/backup/export`

The run fails if a sampled endpoint returns non-2xx, non-JSON, or a
sensitive-looking raw value.

## Scope

This is a no-live reliability check. It must not enter KIS credentials, issue
tokens, request approval keys, open WebSocket sessions, run cap tests, or run
daily/minute backfill live calls.

## Suggested use

Before beta release prep:

```bash
npm test
npm run typecheck
npm run build
npm run soak:no-live -- --duration-ms 60000 --interval-ms 5000
```

For quick local iteration:

```bash
npm run soak:no-live -- --duration-ms 15000 --interval-ms 3000
```
