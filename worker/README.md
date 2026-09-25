# Financial Center market data relay — v1.7.0

The PWA uses this Cloudflare Worker for Yahoo chart data and Tiingo's documented APIs. Yahoo is an unofficial integration and may throttle or restrict access. A successful response from one execution environment is not evidence that another environment works; smoke-test the deployed Worker.

## Routes

All routes require the Financial Center Origin, `https://azrism-code.github.io`. GET and OPTIONS are allowed. Origin checking limits browser callers; it is not authentication.

- `/health`: version and supported providers.
- `/market?provider=yahoo|tiingo&symbols=UPS,CCL`: up to eight symbols. Returns normalized `quotes` and per-symbol `errors`.
- `/series?provider=yahoo|tiingo&symbol=UPS&kind=daily|intraday`: chart points with source, currency, exchange timezone and session date.
- Legacy `/quotes` and `/history` routes remain for older installed clients.

Tiingo requests require the user's `X-Tiingo-Token` header. Tokens are forwarded only to Tiingo, never cached, logged, committed or stored in Firestore. Yahoo routes require no token. Yahoo public responses are cached for 60 seconds (snapshots/intraday) or 15 minutes (daily history). Only fixed upstream hosts/routes are allowed.

## Price semantics

Yahoo regular quotes and daily closes are separated from extended-hours bars. Daily change uses the immediately preceding daily session, not `chartPreviousClose`, whose meaning depends on the requested chart range. A missing previous-session close produces an unavailable daily change. During a closed session, the matching daily close is preferred over a potentially different last/reference price. Extended-hours data is displayed separately.

Tiingo uses consolidated reference quotes during regular US market hours and EOD closes outside that session. EOD retrieval consumes one request per symbol, in addition to the snapshot batch; its free hourly quota can therefore limit a full portfolio refresh. The client stops repeating authentication/quota failures and preserves the last known values with an explicit error.

The automatic client option tries Yahoo, then Tiingo for failed symbols only when a device token exists. Provider preference is copied into portfolio records during serialization to remain compatible with existing Firestore rules, and restored as an account preference on load. Chart arrays stay in the local cache. Portfolio history is valued using current quantities, not historical transactions.

## Deployment and checks

GitHub Actions deploys `worker/**` changes using the existing Cloudflare secrets. Do not commit keys.

Run `node --test tests/market-data.test.mjs tests/persistence.test.cjs` from the repository root. The UI smoke test `tests/ui-market-data.cjs` requires Playwright and Chromium, plus the docs site served at `http://127.0.0.1:8765/`. It uses a fake local user and mocked upstream responses, never real portfolio writes. Optionally set `FC_CHROMIUM_BINARY` to an installed Chromium binary.
