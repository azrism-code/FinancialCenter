# Financial Center — PWA v1.7.0

Live app: https://azrism-code.github.io/FinancialCenter/

The deployed app is in `docs/` (GitHub Pages), with Firebase Google authentication and Firestore portfolios per user. `worker/` is the Cloudflare market-data relay, deployed by GitHub Actions. The older framework prototype outside `docs/` is not the deployed PWA.

- Independent portfolios, CSV imports, stock details and mobile installation.
- Account provider preference: automatic (Yahoo first), Yahoo, or Tiingo.
- Connection comparison in Settings; Tiingo keys remain device-local.
- Daily change uses the previous session from the same provider; extended-hours prices appear separately.
- Intraday stock/portfolio charts with time and price ticks. Charts load for visible stocks and holdings.
- Reimport preserves provider prices. Failed updates retain the last value with its source/date and an error.
- Yahoo index and exchange-suffixed symbols are accepted. Different holding currencies are not silently summed.

Serve `docs/` locally with `python -m http.server 8765 --directory docs`. Market requests require the deployed origin, so use the mocked UI test locally. Run core checks with `node --test tests/market-data.test.mjs tests/persistence.test.cjs`.

See `worker/README.md` for API behavior, deployment and UI checks. Do not commit portfolio exports or API keys. Background alerts and push notifications are not implemented.
