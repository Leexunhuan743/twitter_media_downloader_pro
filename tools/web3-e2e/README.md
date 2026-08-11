# Web3 Browser Acceptance

Run `01-responsive-logs.js` in the browser page context while Web3 is active.
Execute it at widths 901, 1000, 1216, and a mobile width such as 390 pixels.
The returned `passed` value verifies the document, content area, Logs filter
grid, and every filter control remain inside the viewport.

This browser check complements `internal/api/web3_frontend_test.go`, which
locks the CSS contract without pretending that source-string assertions prove
rendered geometry.

For isolated layout checks, start the bundled read-only mock server:

```powershell
node tools/web3-e2e/mock-server.js 25558
```

Then open `http://127.0.0.1:25558/`. The mock serves repository assets and
empty API responses; it does not read the real configuration or database.
