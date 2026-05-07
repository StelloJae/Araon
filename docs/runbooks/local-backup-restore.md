# Local backup and restore

Araon local backup is intentionally scoped to user-authored local state.

Included:

- tracked stocks
- favorites
- stock observation notes
- stock observation plans

Excluded:

- KIS credentials
- access tokens
- approval keys
- account identifiers
- runtime session state
- price candles and raw market data

## API

Export:

```http
GET /runtime/backup/export
```

Restore:

```http
POST /runtime/backup/restore
Content-Type: application/json
```

The payload uses `schemaVersion: 1`. Restore writes tracked stocks first, then
favorites, notes, and observation plans so foreign-key dependent local records
can be restored safely.

## UI

The Settings connection tab exposes a small **로컬 백업 / 복원** panel.
The panel downloads a JSON backup and accepts the same JSON for restore.

## Safety

This feature never exports `credentials.enc`, tokens, approval keys, account
values, candles, or raw tick data. It is not a market-data backup mechanism.
