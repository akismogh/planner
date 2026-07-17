# Retirement Planner — AI Insights relay

A tiny Cloudflare Worker that holds the Anthropic API key server-side so it
never ships inside the app (browser bundle or Android APK). The client sends
only an anonymized, numeric summary of the retirement projection; this
worker forwards it to Claude and relays the reply back.

## One-time setup

```bash
cd worker
npx wrangler login          # opens a browser to log into / create a free Cloudflare account
npx wrangler secret put ANTHROPIC_API_KEY   # paste your sk-ant-... key when prompted
npx wrangler deploy
```

The deploy command prints the worker's URL, e.g.
`https://retirement-planner-ai.<your-subdomain>.workers.dev`.

Put that URL in `client/.env.github` as:

```
VITE_AI_WORKER_URL=https://retirement-planner-ai.<your-subdomain>.workers.dev
```

Then rebuild/deploy the web app as usual. The Android app reads the same
build output, so no separate step is needed there.

## Notes

- CORS is locked to the app's two origins (`akismogh.github.io` and the
  Android WebView's `appassets.androidplatform.net`) — the endpoint refuses
  requests from anywhere else.
- The worker never logs or stores request bodies; it only forwards them to
  Anthropic and returns the reply.
- Cost is pay-per-use on your Anthropic account — a few suggestions cost a
  fraction of a cent.
