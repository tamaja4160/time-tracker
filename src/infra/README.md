# Infrastructure layer (adapters)

Side-effecting adapters defined behind interfaces so the domain and UI can be
tested against in-memory fakes: `LogStore` (localStorage), `Clock`
(wraps `Date`/`performance.now`), `AuthClient`, and `GoogleSheetsConnector`
(network calls to the BFF).
