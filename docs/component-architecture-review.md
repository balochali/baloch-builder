# Component architecture review and consolidation

Reviewed 9 October 2026. This is a repository-wide structural review with detailed inspection of uploads, payment forms, document persistence, previews, printing, tables, and the largest feature pages. It is not a claim that every business rule or native command has been exhaustively audited.

## Outcome of this change

The repeated upload controls are now one `AttachmentUpload` component. Eight feature files use it at ten upload locations: partner contribution, partner management, payout, agreement documents, construction receipt, supplier bill, sale documents, land receipt, land documents, and the shared Amanat receipt picker (used for deposits and returns). A source search now finds the production `type="file"` input only in this component.

Partner contribution, management and payout forms now share `PartnerPaymentFields`. Construction uses the same `PaymentMethodOptions` as the existing `PaymentMethodSelect`, instead of maintaining its own payment-method list and icons.

Image-gallery primitives now live in `src/components/attachments`, rather than requiring common UI to import a feature page. Domain-aware document cards live in `features/documents/components` and are reused by Bank, Documents and Partners.

## Reuse contracts

### AttachmentUpload

Location: `src/components/AttachmentUpload.tsx`, with its own `attachment-upload.css`.

- Controlled `files` and `onChange` keep ownership with the caller.
- `allowPdf` defaults to false. Existing image-only repositories remain image-only; this refactor does not silently allow unsupported files.
- `mode` chooses append or replace, preserving each existing flow.
- `disabled` blocks selection and removal during persistence.
- Title, description, label and icon are presentation options, not separate implementations.
- Selection validates the entire batch before changing the current files. Cancelling the picker preserves the selection.
- A cleared input permits selecting a file again. Previews and removal are built in.
- `onError` integrates with an existing form alert, while the component also provides a local accessible error.
- The component does not save transactions or documents. Repositories remain responsible for owner IDs, dates, methods and native file writes.

Validation is defined once in `src/domain/attachments.ts`: JPEG, PNG, WebP, GIF; optional PDF; non-empty files; maximum 10 MiB. The uploader and document repository use this policy. Rust still validates native writes independently; its size/type boundary must remain enforced even if frontend validation is bypassed.

### Payment components

`PaymentChoices.tsx` owns the method catalogue, icons, selection state presentation, account choices and modal heading. `PaymentMethodOptions` supports embedding only the buttons into an existing section. `PaymentMethodSelect` adds the titled panel and optional children.

`PartnerPaymentFields.tsx` owns partner-specific fields and their layout, unique IDs and accessible labels. All three partner payment forms use it. A change to bank, wallet, cash or cheque fields now applies in one place.

Do not use this component directly for Udhaar, land or personal expenses merely because their screens look similar. Persisted models differ:

- Partners/project finance use `from_bank`, `to_bank`, account numbers and cheque details.
- Udhaar/Amanat use `received_by`, `provider`, `account`, `reference`, and method.
- Land uses its own payment schema and status-transition transaction.

Share selection and input presentation; preserve explicit adapters and domain validation. A universal schema migration would require compatibility tests for existing records.

### Already shared effectively

Keep and extend these rather than adding replacements:

- `components/ui`: Button, Dialog, Input, Label and other primitives.
- `Pagination`, `usePagination`, `PaginatedRecords`: page controls and record slicing.
- `RecordFilters`: search, facets, date and amount filtering.
- `TimeSeriesChart`: common chart rendering and controls.
- `domain/money`, `domain/bankAccount`, `lib/dates`: formatting and account names.
- `data/client.ts`: SQLite connection and query/execute boundary.
- `SavedImageGallery`, `SelectedImagePreviews`, `DocumentPreviewCards`: existing preview presentations for different contexts.

## Remaining findings and recommended boundaries

### 1. Large pages still combine unrelated responsibilities — high priority

At the review snapshot, ProjectDetailPage exceeded 2,200 lines, CreditUdhaarPage 1,500 and PersonalExpensePage 1,300. Line counts alone are not defects, but inspection shows page loading, forms, validation, mutation orchestration and rendering living together.

Recommended next extractions:

- ProjectDetailPage: land acquisition wizard, project status dialog, tab data/loading controller. Keep land creation and status updates in their existing repository operation.
- CreditUdhaarPage: UdhaarForm, RepaymentForm and activity charts are already named local components and can move to feature components without inventing a generic financial wizard.
- PersonalExpensePage: ExpenseForm and ExpenseTrend can move into feature components, with the page retaining filtering and selection.
- PersonalDepositPage: deposit and return forms should remain separate feature components because their validation and retry rules differ.

These larger page splits are not claimed as completed in this change.

### 2. CSS ownership is the main source of visual regressions — high priority

`workspace-redesign.css` exceeded 4,200 lines and `workspace-ui.css` 1,300. Broad selectors overlap with feature styles. A concrete example is `.app-main table td { vertical-align: top }`, which overrode Bank's local alignment before a more specific Bank rule was added.

New shared controls now own their styles. Incrementally move matching legacy rules into those components and remove obsolete selectors only after confirming no remaining usage. Avoid another global override file. Use layout classes/variants rather than adding increasingly specific selectors to fix each screen.

### 3. Save-then-upload behavior should be a separate shared workflow — high priority

Partner contributions and Amanat can retain a saved transaction ID to retry failed attachments. Partner management and payout still have different error handling for partially successful attachment batches. UI reuse alone does not standardize these semantics.

A future attachment persistence helper should return successful document IDs and failed files, retaining the already-saved payment ID. It must never replay a financial mutation when retrying a receipt. Build failure/retry tests before migrating the remaining flows; do not put payment mutation logic inside AttachmentUpload.

### 4. Print preview mechanics repeat — medium priority

Project, Land and Bank each handle iframe readiness, print invocation, preview/options switching and errors. Extract a shared PrintPreviewFrame or dialog shell when extending printing next. Keep report builders and selection options domain-specific. Land must retain image/PDF handling; Bank must retain its explicit net-movement versus actual-balance distinction.

### 5. Preview layouts should share loading, not become one oversized component — medium priority

Selected files use browser object URLs; saved files load bytes through Tauri; land adds slider navigation; Documents adds source categorization. These are distinct presentation needs. A shared saved-image loading hook can centralize cancellation, errors and URL cleanup. Preserve accessible full-size viewing and PDF handling.

### 6. Table and card layouts require explicit variants — medium priority

DataTable exists, but Bank needs receipt cells and numeric ledger alignment. Keep domain columns/renderers and share a table shell or CSS tokens where useful. Do not replace every table with one prop-heavy component or move business-specific row actions into a generic table.

### 7. Routing and bundle size — medium priority

The router eagerly imports feature pages. Production build reports a JavaScript chunk larger than 500 kB. Route-level lazy loading is a separate performance improvement; component extraction by itself does not guarantee smaller bundles. Validate Tauri navigation and loading states when introducing it.

### 8. Repository and native boundaries — keep intact

Fourteen repository modules, the SQL client, 18 migrations and native command modules provide useful domain boundaries. Similar INSERT statements do not automatically justify a generic CRUD repository. Owner validation, archive rules, status transitions and rollback behavior differ. No database schema or native command changes were made for this consolidation.

## Verification and limits

The first full run executed 217 tests: 209 passed and eight failed. Failures were inspected, not suppressed: obsolete payment labels/default-account assumptions and upload-control assertions were updated to current user requirements; the validation message assertion now checks the shared policy. Added dedicated shared-input tests cover batch rejection, PDF policy, append/removal, picker reset, and unique payment-field IDs.

Final verification: production build passed; full lint passed; the final full regression suite passed 221 of 221 tests across 51 files. Tests exercise frontend and repository behavior with native calls mocked or SQLite fixtures; this does not constitute an interactive Windows/Tauri visual run or a native build.

## Rules for future changes

1. Search shared components before building a new upload, method picker, account choice, pagination control or preview.
2. Keep schemas and financial mutations in their domain/repository layer.
3. Compose smaller controls through children/slots and typed props; avoid page-name switches in generic components.
4. Keep reusable CSS next to its component and use theme variables.
5. Test shared behavior once, then retain feature integration tests for saving, ownership and retries.
6. Preserve established differences explicitly (PDF policy, append/replace, read-only versus editable), rather than hiding them behind duplicated markup.
