# Retired Note Mini verification

Last verified: 2026-11-04 (source inspection)

## Retirement checks

1. Confirm `frontend/src/App.jsx` has no `/note_mini` route or Memos component import, and `frontend/src/misc/memos.tsx` is absent.
2. Confirm admin navigation/configuration catalogs no longer advertise the retired integration: no legacy `笔记` entry, `note.cfg` option or registered `note.setting` metadata.
3. Confirm the backend has no active `note` name mapping. Keep numeric slot `FlagNote = 2` reserved and subsequent service IDs unchanged.
4. Build the frontend and run narrow backend checks covering the modified registration/share packages. Select broader checks through `shared/testing.md` when requested.
5. Inspect the diff to ensure shared R2 upload, AI rewrite/transcription, Library/Todone note paths and `backend/mian_go_lib` are untouched.
6. Check that unrelated local files, stored configuration, browser drafts and remote objects were not deleted.

No live Memos URL/key, provider call or R2 upload is required to verify retirement. The old mock-send workflow is no longer applicable because Platform has no such caller. Current Note Mini behavior and its tests belong to `memos-mian`.

A local source/build check does not prove that a deployed Platform, Caddy rule or Cloudflare CORS policy has changed. Infrastructure verification is a separate authorized operation.
