# Domain layer (pure)

Framework-independent, side-effect-free TypeScript modules: `TimerEngine`,
`validation`, `ActivityLogService` (ordering/append), `CsvExporter`, and the
Google Sheets row/column mapping. No DOM, no `Date.now()` (time is injected via
`Clock`), no network. This layer is covered by the property-based tests.
