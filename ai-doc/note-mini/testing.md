# Note Mini Testing Workflow

Last verified: 2026-08-24

## Goal

1. Verify `note_mini` features end-to-end without polluting formal memo data.
2. Use local mock URL/KEY plus a mocked/test R2 upload path to run send, encrypted upload, ordinary upload, and AI rewrite checks safely.

## Safety baseline

1. Always use virtual test config for note service:
   - URL: local mock service (for example `http://127.0.0.1:18080`)
   - KEY: any test string (for example `mock-live-send-key`)
2. With virtual URL/KEY, requests never hit formal memo environment, so no formal dirty data is produced.
3. Record local artifacts and clean them after test (for example `/tmp/memos_capture.log`).
4. Do not run an encrypted-upload check against the formal R2 bucket. Intercept/mock `/api/misc/r2-presigned-url` and its returned PUT target, or use an explicitly configured test bucket.

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
   - the tag button stays at the far left, shows `标签` when empty, joins selected tag names with `、`, and ellipsizes long content without displacing the right-side actions
   - encrypted upload, AI optimization, file upload, divider, voice input, and send actions stay right-aligned in that order
   - encrypted upload, AI optimization, file upload, and voice input use icon-only buttons with accessible labels/tooltips
   - opening the tag button selects it, then focuses and expands the tag selector after the outer popover is positioned; the option list keeps its full width and does not resize the memo input
7. Click `发送` (real send).
8. Verify UI result:
   - request queue shows success icon
   - input is cleared after successful enqueue/send
9. Verify captured payload in mock logs:
   - content starts with the plaintext from step 5
   - selected tags are appended as `#tag1 #tag2 ...`
10. Run adjacent regression:
    - click encrypted upload, enter a known tip/password/password hint, and submit against the mocked/test R2 target
    - verify the uploaded binary starts with a 12-byte IV and the remaining bytes decrypt with `SHA-256(password)` + AES-GCM (`tagLength = 128`) to exactly the original UTF-8 draft
    - verify the captured memo contains the tip, `密码提示：<hint>`, and `[下载加密文件](<mock public URL>)`, but contains neither plaintext nor password
    - repeat without a password hint and verify that line is omitted
    - force encryption/upload failure and verify the draft, tags, and modal values remain available
    - click the AI rewrite icon and verify the rewrite flow opens without crashing
    - click the file upload icon and verify the clipboard/local-file selection flow opens
    - start and stop voice input and verify the expanded recording pill shows a non-repeating live waveform without breaking the action row

## Pass criteria

1. Real send request reaches mock endpoint successfully.
2. Captured payload contains the expected plaintext and tags.
3. The single-row bottom layout remains intact at desktop and mobile widths, and the memo input keeps the same size while the tag popover opens or closes.
4. Encrypted upload, ordinary upload, AI optimization, and voice icon actions remain reachable and correctly labeled.
5. The encrypted object uses binary `[12-byte IV][ciphertext || 16-byte tag]` layout, and the memo exposes only its public metadata and download link.
6. No request is sent to the formal memo service or formal R2 bucket.
7. When the task includes UI changes, provide screenshots for both the changed area and a nearby non-target area, and confirm no unintended impact.

## Cleanup checklist

1. Stop mock server and frontend dev server.
2. Delete local capture file (for example `/tmp/memos_capture.log`).
3. Optionally keep mock URL/KEY in `note.setting` for future safe tests; restore real config only when needed for real usage.
