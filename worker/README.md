# Financial Center market data relay

This Cloudflare Worker relays only selected Tiingo quote and daily history requests from the Financial Center GitHub Pages origin. It stores no token or portfolio information. Every user enters their own Tiingo token in the PWA; the Worker forwards it in an Authorization header.

Deploy with `npx wrangler deploy` from this directory in a Cloudflare account. Paste the resulting HTTPS Worker URL into the app's market data settings. Do not commit API tokens or portfolio exports.

The relay accepts up to 100 US-style symbols per quote request, and one symbol for historical daily closes. It does not expose an arbitrary URL proxy. Browser origin checks limit normal browser clients; they are not user authentication, and the Tiingo token remains the actual API credential.
