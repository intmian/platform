# Note Mini Knowledge

Last verified: 2026-07-24

## Module role

1. `note_mini` is a lightweight private memo sender, not a first-party backend domain service.
2. It combines frontend drafting/upload/AI rewrite UX with platform config/misc APIs and an external memos API.

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
   - keyboard submit supports Ctrl+Enter on Windows/Linux and Command+Enter on macOS, including from the tag area
   - upload supports local files and clipboard images from the bottom file-upload icon, then inserts markdown link/image
   - bottom action bar includes `WhisperButton` voice input; transcribed text is appended to the draft input
   - while voice recording is active, the send button is removed and the shared expanded recording pill occupies that action-bar space; the send button returns after recording stops
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
4. The top status bar is hidden when there is no send history.
5. The top status bar is horizontally scrollable when history exists; overflow history remains hidden until the user scrolls.
6. Queue status items open a click popover for text review/copy. Failure retry is an explicit popover action, not the icon's default click behavior.

## Bottom action behavior (verified from code)

1. The bottom area has one fixed action row:
   - left: a `标签` button with the same shape and dimensions as `发送`
   - right: file upload, AI rewrite, voice input, and send actions
2. Clicking the tag button opens the tag selector in a popover above the row; the button uses its selected style while open, and the selector is focused with its option dropdown expanded automatically.
3. The tag popover overlays the page instead of consuming layout height, so opening or closing it does not resize the memo input.
4. File upload, AI rewrite, and voice input are icon-only controls with tooltips and accessible labels.
5. File upload uses `FileAddOutlined` and preserves clipboard-image detection on supported desktop browsers; it is disabled while settings are loading or an upload is already running.
6. AI rewrite uses `RobotOutlined` and is disabled until the memo has content and settings are ready.
7. Voice input remains the shared `WhisperButton`; while recording, its expanded pill replaces the send button space.
8. The send button stays at the far right when voice recording is inactive.
9. Hide/show remains in the top-right control area next to the logged-in user.

## Verification focus

1. Load `note-mini/testing.md` for safe mock-based verification flow.
2. Regression should include:
   - normal submit path
   - AI rewrite path
   - upload path
