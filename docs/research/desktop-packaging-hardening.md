# Desktop Packaging Hardening

Date: 2026-05-06 23:18 KST
Environment: macOS arm64, Darwin 25.3.0
Verdict: CONDITIONAL GO

## Scope

This pass investigated the macOS `codesign` / `spctl` failure found during the
`v1.1.0-beta.11` desktop install acceptance.

It did not mutate the `v1.1.0-beta.11` GitHub Release assets, publish npm,
create tags, enter real KIS credentials, issue KIS tokens, request approval
keys, open WebSocket sessions, run cap tests, or run live backfill.

## Finding

The `v1.1.0-beta.11` desktop app was built with:

```json
{
  "mac": {
    "identity": null
  }
}
```

Electron Builder therefore skipped bundle signing:

```txt
skipped macOS code signing  reason=identity explicitly is set to null
arm64 requires signing, but identity is set to null and signing is being skipped
```

The resulting app bundle had no top-level `_CodeSignature/CodeResources`, while
the Mach-O executable still carried linker/ad-hoc signature metadata. Local
reproduction showed:

```txt
Identifier=Electron
Signature=adhoc
Info.plist=not bound
Sealed Resources=none
```

That mismatch caused bundle verification to fail with:

```txt
code has no resources but signature indicates they must be present
```

## Fix

The macOS Electron Builder identity was changed from `null` to `"-"`.

Electron Builder documents `"-"` as the ad-hoc signing identity. This keeps the
beta unsigned from a Developer ID / notarization perspective, but still produces
a coherent local code signature and sealed resources for the app bundle.

After the change, a local macOS desktop build reported:

```txt
signing file=release/desktop/mac-arm64/Araon.app platform=darwin type=distribution identityName=-
skipped macOS notarization reason=`notarize` options were unable to be generated
```

The rebuilt app now has:

```txt
Identifier=io.github.stellojae.araon
Signature=adhoc
Info.plist entries=32
Sealed Resources version=2 rules=13 files=58
```

During beta.12 release validation, local direct launch also exposed a native
module packaging issue: `better-sqlite3` was copied with host Node ABI 141 while
Electron 41 requires ABI 145. The desktop build config now pins:

```json
{
  "nativeRebuilder": "legacy"
}
```

The legacy native dependency rebuild path produced:

```txt
_node_register_module_v145
```

for the packaged `better_sqlite3.node`.

`codesign --verify --deep --strict --verbose=4` now passes:

```txt
release/desktop/mac-arm64/Araon.app: valid on disk
release/desktop/mac-arm64/Araon.app: satisfies its Designated Requirement
```

The same check was also run against fresh local `dist:mac` artifacts:

```txt
ZIP app: valid on disk, satisfies its Designated Requirement
DMG app: valid on disk, satisfies its Designated Requirement
```

`spctl -a -vv` still rejects the app:

```txt
release/desktop/mac-arm64/Araon.app: rejected
```

This is expected for an ad-hoc signed beta app without Apple Developer ID
signing and notarization. The important change is that the previous broken
signature/resource-seal error is gone.

## Gatekeeper Posture

Current beta posture:

- Local app bundle signature: ad-hoc and internally coherent.
- `codesign --verify --deep --strict`: expected to pass on macOS builds made
  after this change.
- `spctl`: expected to reject until Developer ID signing and notarization are
  added.
- Browser-downloaded quarantine/Finder launch path: still not validated.

Not done in this pass:

- Apple Developer ID signing.
- Apple notarization.
- Certificate or secret setup.
- Replacing already published release assets.

## Desktop DataDir Policy

The desktop app uses Electron `userData` as the default desktop data root:

```txt
~/Library/Application Support/@stellojae/araon/data
```

This is the intended desktop policy for beta:

- CLI/server operators can use `--data-dir` or `ARAON_DATA_DIR`.
- Desktop users get the OS application support path.
- Desktop acceptance should record the resolved userData path explicitly.

## Windows Status

Windows desktop execution remains not executed in this macOS environment.

Only asset existence/checksum validation has been completed so far. Windows
Setup/portable EXE first-run validation remains manual pending.

## Safety Result

- Real KIS credentials entered: `0`
- Credentialed KIS token issuance: `0`
- Approval key issuance: `0`
- WebSocket sessions: `0`
- Cap tests: `0`
- Daily/minute backfill live runs: `0`
- npm publish/tag/release: `0`
- GitHub Release asset mutation: `0`

## Next Release Recommendation

The next desktop beta should include the `mac.identity="-"` configuration so
new macOS artifacts avoid the broken signature/resource-seal state.

This does not make the desktop app stable/signed/notarized. Stable desktop
readiness still requires:

- Browser-downloaded quarantined DMG/ZIP validation.
- Windows Setup/portable EXE execution validation.
- Developer ID signing and notarization, when public desktop distribution is
  desired.
