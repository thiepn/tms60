# TMS 60 NIV API Worker

This Worker keeps the API.Bible credential server-side and exposes only the fixed 60-passage TMS dataset. TMS60 visitors never enter or receive an API key.

## One-time deployment

1. Obtain API.Bible access that includes NIV and permits this app use.
2. In this directory run `npm install`.
3. Authenticate with Cloudflare using `npx wrangler login --device` (or the normal Wrangler login flow).
4. Store the credential with `npx wrangler secret put API_BIBLE_KEY`. Enter the key only into Wrangler/Cloudflare, never into repository files.
5. Run `npm run check` and then `npm run deploy`.
6. Copy the deployed HTTPS Worker URL and place it in the root `niv-service.json` as `baseUrl`.

The Worker caches the complete 60-passage dataset for 14 days at the edge and the browser also keeps the selected NIV dataset for no more than 14 days. The API key is never shipped to the browser.
