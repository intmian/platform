# Note Mini Knowledge

Last verified: 2026-04-27

## Module role

1. `note_mini` is a lightweight private memo sender, not a first-party backend domain service.
2. It combines frontend drafting/upload/encryption UX with platform config/misc APIs and an external memos API.

## Test reference

1. Standard safe test flow is documented in `note-mini/testing.md`.
2. Preferred mode is virtual URL/KEY + local mock endpoint, so formal memo data is not polluted during feature tests.

## Frontend entry

1. Route is `/note_mini`, component entry is `frontend/src/misc/memos.tsx`.
2. Shared auth/request shell behaviors come from `ai-doc/frontend/architecture.md`.

## API surface

1. Platform-side calls:
   - `POST /cfg/note/get`
   - `POST /cfg/note/set`
   - `POST /misc/gpt-rewrite`
   - `POST /misc/r2-presigned-url`
2. Real memo submit target:
   - `POST {url}/api/v1/memos`

## Backend dependency

1. `note_mini` has no dedicated first-party backend service module in this repo.
2. It depends on platform gateway/config APIs for settings and utility calls:
   - `POST /cfg/note/get`
   - `POST /cfg/note/set`
   - `POST /misc/gpt-rewrite`
   - `POST /misc/r2-presigned-url` (used by shared upload helper)
3. Real memo submit target is external memos API (`POST {url}/api/v1/memos`), not `/service/note/*`.
4. If task involves auth/config/permission failures around note-mini, additionally load:
   - `ai-doc/frontend/architecture.md`
   - `ai-doc/backend/architecture.md`
   - `ai-doc/backend/gateway-auth.md`
   - `ai-doc/backend/config-and-ai.md`
   - `ai-doc/backend/services.md`
   - `ai-doc/backend/testing.md`
5. `note` config routes work because `note` exists in service-flag mapping even though a real note backend service is not registered.

## User-side capabilities

1. The page is a lightweight private memo sender:
   - input area supports markdown text
   - tag input supports Ctrl+Enter submit from tag area
   - upload supports local files and clipboard images, then inserts markdown link/image
   - submit queue shows recent send status icons (success/failure/loading)
3. Upload trigger path uses a reused hidden `input[type=file]` (not recreated per click), and resets `value` before click to avoid occasional "click upload but nothing happens" behavior.
4. The top-right control area places a small eye toggle to the left of the logged-in user; it switches between visible/hidden draft display without moving the bottom action bar layout.
5. When the draft is fully deleted, hide mode is cancelled automatically so the page-level hidden state does not remain latched on an empty input.
6. The top-right settings button writes note service config into `note.setting` through `sendCfgServiceSet`.
7. Input draft is cached in browser `localStorage` key `note.lastInput`; clearing input or deleting all content removes it.
8. Mobile tag selector on `/note_mini` truncates selected tag text (`maxTagTextLength=3`) and uses responsive tag collapsing (`maxTagCount="responsive"`) to avoid bottom action row layout break on narrow screens.

## Data contract and submit flow

1. Real submit call is `SendMemosReq`, posting to `POST {url}/api/v1/memos`.
2. Queue/history is frontend-only (`reqHis`), capped to 20 entries, each carrying:
   - `content`
   - selected `tags`
   - local id
3. Payload content format is always:
   - `<content>\n#tag1 #tag2 ...`
4. The top status bar is horizontally scrollable; overflow history remains hidden until the user scrolls.
5. Queue status items open a click popover for text review/copy. Failure retry is an explicit popover action, not the icon's default click behavior.

## Advanced menu behavior (verified from code)

1. Bottom action bar uses an advanced dropdown trigger button at the original AI button position (current label: `更多`).
2. Advanced dropdown contains:
   - `AI重写`: same behavior as previous AI button
   - `加密上传`: opens modal for AES key + tip, then sends encrypted content
3. Hide/show is no longer inside the advanced dropdown; it is controlled by the top-right eye button next to the login user display.
4. AES key input uses `Input.Password` with `autoComplete="new-password"` and is not persisted to local storage.
5. Encrypted submit content format is:
   - `<tip>\n<aes-gcm encrypted blob>`
   - encrypted blob format: `aes-gcm:<base64(iv)>:<base64(ciphertext)>`
6. Encrypted submit still goes through the same normal submit queue path (`AddHis` -> `SendMemosReq`).
7. Advanced dropdown trigger is disabled only during setting loading; when input text is empty and settings are ready, trigger remains enabled while both menu items stay disabled (verified via interaction).

## Verification focus

1. Load `note-mini/testing.md` for safe mock-based verification flow.
2. Regression should include:
   - normal submit path
   - AI rewrite path
   - upload path
