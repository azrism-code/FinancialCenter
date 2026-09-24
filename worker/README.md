# Financial Center market data relay

This Cloudflare Worker relays only selected Tiingo quote and daily history requests from the Financial Center GitHub Pages origin. It stores no token or portfolio information. Each user enters their Tiingo token in the PWA; the Worker forwards it to Tiingo.

## Deployment from GitHub

The repository includes `.github/workflows/deploy-cloudflare.yml`. In the repository's Settings → Secrets and variables → Actions, add these repository secrets:

- `CLOUDFLARE_API_TOKEN`: a Cloudflare API token limited to this account with Workers edit/deploy permission.
- `CLOUDFLARE_ACCOUNT_ID`: the Cloudflare account ID.

Never put either value in the repository, a PR, or a chat message. After the feature branch is reviewed and merged into `main`, changes to `worker/**` deploy automatically. The workflow can also be run from the Actions tab. Copy the resulting `https://...workers.dev/` address from the deploy output to the app's quote settings. Alternatively, deploy locally with `npx wrangler deploy` from this directory.

The relay accepts up to 100 US-style symbols per quote request, and one symbol for historical daily closes. It does not expose an arbitrary URL proxy. Browser origin checks limit normal browser clients; they are not user authentication, and the Tiingo token remains the actual API credential.
