# Note Mini Testing Workflow

Last verified: 2026-02-27

## Goal

1. Verify `note_mini` features end-to-end without polluting formal memo data.
2. Use local mock URL/KEY to run real send, encryption, and decryption checks safely.

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
6. Open `高级` menu, click `加密上传`, fill:
   - AES key (test key)
   - tip (test tip)
7. Click `加密并发送` (real send).
8. Verify UI result:
   - request queue shows success icon
   - input is cleared after successful enqueue/send
9. Verify captured payload in mock logs:
   - content format is `<tip>\n<aes-gcm:...>`
   - second line follows `aes-gcm:<base64(iv)>:<base64(ciphertext)>`
10. Decrypt captured cipher using the same AES key and verify plaintext equals step 5 input.
11. Run adjacent regression:
    - open `高级` -> `AI重写` (no crash path), or
    - submit without AES key and verify validation error appears.

## Pass criteria

1. Real send request reaches mock endpoint successfully.
2. Captured payload contains tip + AES-GCM ciphertext in expected format.
3. Decryption output exactly matches original plaintext.
4. No request sent to formal memo service.
5. When the task includes UI changes, provide screenshots for both the changed area and a nearby non-target area, and confirm no unintended impact.

## Cleanup checklist

1. Stop mock server and frontend dev server.
2. Delete local capture file (for example `/tmp/memos_capture.log`).
3. Optionally keep mock URL/KEY in `note.setting` for future safe tests; restore real config only when needed for real usage.
