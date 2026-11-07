# Retired Note Mini integration

Last verified: 2026-11-04 (source inspection)

## Status and ownership

Note Mini is now a feature of the independently maintained `memos-mian` application. Platform no longer owns its page, account/configuration bridge, memo submission or tag queries. There is no replacement URL or automatic redirect in Platform.

The following dedicated integration was removed from Platform source:

- `/note_mini` and its `frontend/src/misc/memos.tsx` component.
- The admin header's legacy `笔记` entry and the `note.cfg` permission option.
- Registration of `note.setting` configuration metadata in `PlatForm.InitCfg()`.
- The active `note` service-name/flag mapping. `FlagNote` remains reserved at numeric value 2; `FlagAccount`, `FlagCmd` and `FlagTodone` retain values 3, 4 and 5.

There was never a registered first-party Note Mini backend service. Service-wide `/cfg/note/get` and `/cfg/note/set` now fail the gateway's existing unknown-service check. Generic configuration routes and shared permissions are otherwise unchanged; this retirement is not a redesign of the configuration gateway.

## Preserved data and shared features

No migration or deletion accompanies retirement. Stored `note.setting`, previously granted permission strings, browser drafts/settings and uploaded files are left intact. In particular, removal does not clear `note.lastInput`, rewrite historical memo bodies, fetch historical links, delete R2 objects or create native attachment records for old links.

The following Platform facilities remain shared and active:

- Native account/configuration infrastructure for other modules.
- R2 signing/upload helpers and `PLAT.r2.*` configuration.
- AI rewrite, file transcription, realtime transcription, `WhisperButton`, recording/worklet helpers and their configuration.
- Library/Todone notes, ratings, voice input and review-digest workflows.
- The `backend/mian_go_lib` submodule and its separate history.

Their contracts live in `frontend/architecture.md`, `backend/config-and-ai.md`, `library/knowledge.md` and `todone/knowledge.md`. Removing a caller does not authorize deleting these dependencies.

## Historical encrypted-file compatibility

This is a read-compatibility reference, not an active Platform feature. The retired composer encrypted UTF-8 text with AES-256-GCM using `SHA-256(UTF-8 password)` as the key, a fresh 12-byte IV, a 128-bit authentication tag and no salt or AAD. The `.notemini.enc` file contains `IV || ciphertext || tag`.

The old public memo body joined these lines with single newlines:

1. The public tip.
2. Optional `密码提示：<hint>`.
3. `[下载加密文件](<publishUrl>)`.

Selected tags followed the body. The download URL can be opaque and need not end in `.notemini.enc`; it was a Markdown link, not necessarily a native attachment record. `memos-mian` owns current import/decryption behavior. Preserve these historical links and their original objects.

## Infrastructure boundary

These source edits do not modify deployed Caddy routing, Cloudflare rules, R2 CORS policy, production configuration or running services. Release memos-mian and verify its production entry before deploying this Platform retirement; only then remove confirmed bridge-only cross-origin rules in a separately authorized infrastructure change. Shared R2 upload/read policies and historical file domains are not retirement targets. Any inspection or cleanup of those external resources must follow `shared/production-operations.md` and the user's authorization for that operation.
