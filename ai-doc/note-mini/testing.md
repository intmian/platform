# Note Mini Testing Workflow

Last verified: 2026-07-24

## Goal

1. Verify `note_mini` features end-to-end without polluting formal memo data.
2. Use local mock URL/KEY to run send, upload, and AI rewrite checks safely.

## Safety baseline

1. Always use virtual test config for note service:
   - URL: local mock service (for example `http://127.0.0.1:18080`)
   - KEY: any test string (for example `mock-live-send-key`)
2. With virtual URL/KEY, requests never hit formal memo environment, so no formal dirty data is produced.
3. Record local artifacts and clean them after test (for example `/tmp/memos_capture.log`).

## Standard test flow

1. Pre-check runtime before starting anything:
   - verify whether frontend dev server is already running and reachable
   - verify whether local mock memos backend is already running and reachable
   - only start the missing side(s), avoid duplicate startup
2. Start frontend dev server (`frontend`, `npm run dev`) if not already running.
3. Start local mock memos server if not already running. It must support:
   - `GET /api/v1/users/1:getStats` (return `{ "tagCount": {} }`)
   - `POST /api/v1/memos` (capture request body and return success JSON containing `content`)
4. Open `/note_mini` and set config in the page settings modal:
   - URL = mock URL
   - KEY = mock key
5. Type a known plaintext in memo input.
6. Verify the bottom layout:
   - the tag button stays at the far left and matches the send button's shape and dimensions
   - file upload, AI rewrite, voice input, and send actions stay right-aligned
   - file upload, AI rewrite, and voice input use icon-only buttons with accessible labels/tooltips
   - opening the tag button selects it, focuses the tag selector, expands the option dropdown immediately, and does not resize the memo input
7. Click `发送` (real send).
8. Verify UI result:
   - request queue shows success icon
   - input is cleared after successful enqueue/send
9. Verify captured payload in mock logs:
   - content starts with the plaintext from step 5
   - selected tags are appended as `#tag1 #tag2 ...`
10. Run adjacent regression:
    - click the AI rewrite icon and verify the rewrite flow opens without crashing
    - click the file upload icon and verify the clipboard/local-file selection flow opens
    - start and stop voice input and verify the expanded recording pill does not break the action row

## Pass criteria

1. Real send request reaches mock endpoint successfully.
2. Captured payload contains the expected plaintext and tags.
3. The single-row bottom layout remains intact at desktop and mobile widths, and the memo input keeps the same size while the tag popover opens or closes.
4. Upload, AI rewrite, and voice icon actions remain reachable and correctly labeled.
5. No request is sent to the formal memo service.
6. When the task includes UI changes, provide screenshots for both the changed area and a nearby non-target area, and confirm no unintended impact.

## Cleanup checklist

1. Stop mock server and frontend dev server.
2. Delete local capture file (for example `/tmp/memos_capture.log`).
3. Optionally keep mock URL/KEY in `note.setting` for future safe tests; restore real config only when needed for real usage.
