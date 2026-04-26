# Family Money Book Testing

Last verified: 2026-04-26

## Automated Checks

1. Backend focused regression:
   - `cd backend`
   - `go test ./platform -run 'Money|ComputeMoney' -count=1`
2. Frontend scoped lint:
   - `cd frontend`
   - `npx eslint src/App.jsx src/admin/IndexHeader.jsx src/money --ext js,jsx,ts,tsx --report-unused-disable-directives --max-warnings 0`
3. Frontend production build:
   - `cd frontend`
   - `npm run build`
   - Existing large chunk warnings are expected unless chunking is changed separately.

## Real Excel Verification

1. Use `MONEY_REAL_XLSX` to point the optional test at a local workbook:
   - `cd backend`
   - `MONEY_REAL_XLSX=/path/to/workbook.xlsx go test ./platform -run TestExcelImportRealWorkbookWhenProvided -count=1 -v`
2. The test uses temporary storage and does not write imported records into the running local app database.
3. It verifies:
   - at least one date sheet is recognized
   - all recognized sheets are valid
   - confirm creates one record per preview sheet
   - repeat confirm skips all duplicate sheets

## Runtime Verification

1. Start or reuse backend:
   - working directory: `backend/test`
   - command: `GOWORK=$(pwd)/../go.work go run ../main/main.go`
2. Start or reuse frontend:
   - working directory: `frontend`
   - command: `npm run dev -- --host 127.0.0.1`
3. Login uses the normal cookie flow through `/api/login` in frontend dev mode.
4. For UI changes, verify at least:
   - `/money`
   - `/money/:bookId/config`
   - `/money/:bookId/reconcile/:recordId`
   - `/money/:bookId/history`
   - `/money/:bookId/dashboard`
   - `/money/:bookId/import`
5. Mobile dashboard regression must include a 390px-wide viewport and assert no horizontal overflow.

## Data Mutation Accounting

1. Prefer manager/unit tests for destructive behavior such as delete/disable and archive import.
2. If runtime verification creates local books, record created IDs and clean them up only after explicit approval when deletion is required.
3. JSON import intentionally creates cloned books; tests should account for extra imported books in list views.
