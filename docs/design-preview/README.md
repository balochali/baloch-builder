# Modern workspace redesign

Open `index.html` to browse all 14 screens. Switch between desktop, phone and dark mode; select an image to open it at full size. Additional images cover tabs, dialogs and mobile navigation.

## Implementation

- `src/components/WorkspaceIllustration.tsx`: local vector scenes for buildings, land, partners, contacts, documents, expenses, banking, credit, deposits and settings. Decorative scenes are hidden from assistive technology.
- `src/styles/modern-workspace.css`: shared theme colors, illustrated headings, surfaces, controls, responsive layouts and reduced-motion support. Feature-specific chart and building geometry remain in existing styles.
- `src/app/layout/AppShell.tsx` and `Sidebar.tsx`: modal navigation on phones and tablets, with keyboard dismissal, focus restoration, page selection and logout.
- Each workspace page includes its illustration. Authentication retains the architectural photograph with updated controls and colors.

## Verification

- Production build passed. Vite still reports the existing large-bundle advisory.
- Existing suite: 55 test files, 250 tests passed.
- New navigation suite: 2 tests passed, covering page selection, closing, focus restoration and logout.
- Browser: all workspace routes at 1440px and 390px; additional overflow checks at 320px, 768px and 1024px. Main tab panels checked at desktop and phone widths. Light/dark switching and mobile navigation verified.
- `verification.json` records page results. Captures use the real app router and repositories with an isolated in-memory SQLite database created from the project's migrations. Business records on the device are never opened by this preview.
- Native Tauri services, backup/restore and actual file operations use preview stubs; screenshots do not verify those native integrations.

Screenshots show the initial viewport; longer pages scroll in the app. Sample names and financial records are illustrative. Login and setup display light mode when Dark is selected in the gallery. No external image services are required by the redesign.
