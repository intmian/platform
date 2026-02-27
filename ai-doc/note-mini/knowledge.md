# Note Mini Knowledge

Last verified: 2026-02-27

## Test reference

1. Standard safe test flow is documented in `note-mini/testing.md`.
2. Preferred mode is virtual URL/KEY + local mock endpoint, so formal memo data is not polluted during feature tests.

## User-side capabilities

1. Route is `/note_mini`, component entry is `frontend/src/misc/memos.tsx`.
2. The page is a lightweight private memo sender:
   - input area supports markdown text
   - tag input supports Ctrl+Enter submit from tag area
   - upload supports local files and clipboard images, then inserts markdown link/image
   - submit queue shows recent send status icons (success/failure/loading)
3. Upload trigger path uses a reused hidden `input[type=file]` (not recreated per click), and resets `value` before click to avoid occasional "click upload but nothing happens" behavior.
4. The top-right settings button writes note service config into `note.setting` through `sendCfgServiceSet`.
5. Input draft is cached in browser `localStorage` key `note.lastInput`; clearing input removes it.
6. Mobile tag selector on `/note_mini` truncates selected tag text (`maxTagTextLength=3`) and uses responsive tag collapsing (`maxTagCount="responsive"`) to avoid bottom action row layout break on narrow screens.

## Submit and history logic

1. Real submit call is `SendMemosReq`, posting to `POST {url}/api/v1/memos`.
2. Queue/history is frontend-only (`reqHis`), capped to 8 entries, each carrying:
   - `content`
   - selected `tags`
   - local id
3. Payload content format is always:
   - `<content>\n#tag1 #tag2 ...`

## Advanced menu behavior (verified from code)

1. Bottom action bar uses an advanced dropdown trigger button at the original AI button position (current label: `更多`).
2. Advanced dropdown contains:
   - `AI重写`: same behavior as previous AI button
   - `加密上传`: opens modal for AES key + tip, then sends encrypted content
3. AES key input uses `Input.Password` with `autoComplete="new-password"` and is not persisted to local storage.
4. Encrypted submit content format is:
   - `<tip>\n<aes-gcm encrypted blob>`
   - encrypted blob format: `aes-gcm:<base64(iv)>:<base64(ciphertext)>`
5. Encrypted submit still goes through the same normal submit queue path (`AddHis` -> `SendMemosReq`).
6. Advanced dropdown trigger is disabled only during setting loading; when input text is empty and settings are ready, trigger remains enabled while both menu items stay disabled (verified via interaction).
