# Family Money Book Knowledge

Last verified: 2026-04-26

## Scope

1. Covers the family money book module under:
   - backend: `backend/platform/money_book*.go`
   - frontend: `frontend/src/money/*`
2. Shared route/auth/request behavior remains in:
   - `ai-doc/backend/gateway-auth.md`
   - `ai-doc/frontend/architecture.md`

## Ownership

1. Backend owns the durable contract for books, item definitions, records, Excel import, and JSON archive import/export.
2. Frontend owns data-entry ergonomics, confirmation prompts, download/upload file controls, mobile dashboard layout, and runtime summary/structure/trend derivation from raw records plus item config.
3. All management APIs require `admin`; dashboard read allows `admin` or a per-book viewer listed in `MoneyBook.viewerUsers`.

## Core Data Contracts

1. `MoneyBook` contains the book name, primary balance account, enabled flag, deleted flag, and ordered dashboard viewer user list.
2. `MoneyItem.type` is free text. It is only used as a grouping label for summary/structure display; it is not a controlled enum.
3. Item inclusion flags drive calculations:
   - `includeInReconcile`: show book/actual values and force current value to actual value during compute.
   - `includeInCash`: contributes to cash.
   - `includeInInvestmentProfit`: contributes current minus previous value and annualized rate.
   - `includeInNetAsset`: contributes to positive assets unless the item is a liability.
   - `includeInLiability`: contributes to liabilities and liability structure.
   - liability item amounts can be entered as positive or negative numbers in the UI; both mean liability magnitude and are normalized to negative signed values for storage/calculation, while liability summaries and structure displays use absolute values.
   - net-asset liability rate uses the absolute net-asset denominator so the displayed rate is never negative when net assets are below zero.
4. Durable `ReconciliationRecord` storage contains only record identity, date/status, entries, events, source, and audit fields. Runtime APIs do not return persisted summary fields; `intervalDays` is the only derived record-view field and archives must not persist it.
5. Record interval days are derived from the previous confirmed record date when one exists; the frontend treats the field as read-only.
6. Draft records may be deleted through `record/delete`; confirmed records remain editable but cannot be deleted.

## Import And Export

1. Excel import is a two-step admin flow:
   - preview parses date-named sheets like `26-04-06`.
   - confirm creates confirmed records and skips duplicate Excel source sheet names.
2. JSON export returns a single-book archive:
   - book metadata
   - item definitions
   - all records
3. JSON import clones the archive into a new enabled book with a new `bookId`, preserving item IDs and record contents under the new book.
4. JSON import/export is intended for regression testing and reproducible fixture setup; it must not overwrite an existing book.

## UI Behavior

1. `/money` is the module entry:
   - admins can create books, import JSON, export JSON, delete books, configure books, create records, view history, and import Excel.
   - viewers only see authorized dashboard access.
2. Config page:
   - item type is a free-text input.
   - dashboard viewer users are edited as an ordered list with add/delete/move controls.
   - returning to the list with unsaved changes shows a confirmation dialog.
3. Reconcile page:
   - reconcile items show book value and actual value.
   - amount inputs include an expression-entry action for arithmetic such as `200-90`.
   - reconcile items force current value to actual value; the UI does not show a separate current-value column.
   - non-reconcile items hide book value and reuse the actual-value column for current value input.
   - editing record date, entries, or events triggers debounced automatic save and recalculation; the manual save action is only an immediate persistence shortcut.
   - bookkeeping suggestions list type/source/target/amount without description or action columns; the frontend derives transfer, balance expense, balance income, investment gain, and investment loss from the current record, book config, and item config.
   - balance income/expense suggestions are computed from the primary balance account after applying transfer suggestions, so the primary account's remaining imbalance is still visible.
   - change and annualized-rate columns are only shown for investment-profit items.
   - asset/liability calculation shows summary cards for net asset, two liability rates, asset change, and investment profit, followed by a net-asset-rooted tree where liability branches are negative values.
   - draft records expose a delete action with confirmation.
   - confirmed records remain editable and expose save actions.
   - events are an ordered list with drag sorting, inline delete, and add controls.
4. Dashboard:
   - history trend is rendered by the frontend as an SVG line chart with hoverable points for exact values and only shows the latest five trend records.
   - asset/liability structure is rendered by the frontend as a total-to-category-to-account tree from the latest record entries and item config; the backend returns raw dashboard items and records instead of structure summaries.
   - events are shown newest first and paginated at five events per page.
   - dashboard must remain mobile-safe at 390px width with no horizontal overflow.
5. Delete marks a book as deleted and hides it from list APIs; it does not physically purge underlying storage.
