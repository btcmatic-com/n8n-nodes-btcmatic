# n8n-nodes-btcmatic

n8n community node for [BTCMatic](https://btcmatic.com) — the Bitcoin event engine. React to rule fires inside n8n, manage rules programmatically, run backtests, and push external events (TradingView alerts, anything) into webhook-triggered BTCMatic rules.

BTCMatic is the Bitcoin sense for your automations: on-chain, mempool-fee, price and schedule triggers evaluate inside BTCMatic's engine; n8n orchestrates what happens around them.

## Nodes

### BTCMatic Trigger

Starts a workflow when a BTCMatic rule fires.

- Registers its n8n webhook URL as a BTCMatic webhook endpoint automatically (create / check / revoke lifecycle — no manual copy-pasting of URLs).
- Every delivery is verified against BTCMatic's HMAC signature (`X-BTCMatic-Signature`, `t=<ts>,v1=<hex>` over `"<ts>.<body>"`, ±300 s) using the endpoint's one-time signing secret captured at registration. Unsigned or invalid deliveries are rejected with 401 unless you explicitly opt out.
- The emitted item carries the full delivery payload (`claim_key`, `rule_id`, `rule_name`, `event`, evaluation `trace`, optional `outcome`) plus `delivery_key` — stable across retries, use it for dedup.

After activating the workflow, attach a **webhook action** pointing at the registered URL to any of your BTCMatic rules (the rule editor lists registered endpoints).

### BTCMatic (action node)

| Resource | Operations |
|---|---|
| Rule | Get Many, Get, Create, Update, Delete, Enable, Disable, Reactivate |
| Fire | Get Many (with evaluation traces, keyset pagination) |
| Order | Get Many |
| Backtest | Create, Get (poll until `complete`) |
| Inbound Hook | Get Many, Create, Delete, Send Event |

**Send Event** posts a flat JSON payload to a BTCMatic inbound hook (`POST /hooks/{id}/{token}`), optionally HMAC-signed and idempotency-keyed — this is how an n8n workflow wakes a webhook-triggered BTCMatic rule. The rule still evaluates its own conditions inside the engine; an inbound event can never bypass them.

## Credentials

Create an API key in the BTCMatic web app under **Settings → API keys** (Pro and Power plans). The credential needs:

- **API Key** — `btcm_…`, shown once at creation.
- **Base URL** — defaults to `https://api.btcmatic.com`.

The credential test calls `GET /me`.

### Scope: management + dry-run, by design

BTCMatic API keys are deliberately capped: they can list/pause/resume rules, create and update rules, read fires/orders/backtests and manage hooks — but they can **never** create or enable a live exchange-order rule (`422 api_key_live_forbidden`), and API-created order rules never auto-promote out of dry-run. Promotion to live happens only in the web app. Even if your n8n instance or this credential is fully compromised, your funds cannot be spent through it.

## Installation

Self-hosted n8n: **Settings → Community Nodes → Install** → `n8n-nodes-btcmatic`.

Requires n8n ≥ 1.0. No runtime dependencies.

> **Self-hosted note:** BTCMatic's outbound webhook dispatch refuses private/LAN addresses and requires HTTPS — your n8n webhook URL must be publicly reachable over HTTPS for the trigger node (n8n Cloud works out of the box).

## Development

```bash
pnpm install
pnpm run dev     # linked dev n8n instance
pnpm run lint
pnpm run build
```

Releases are published to npm via GitHub Actions with provenance (`pnpm run release` tags and pushes; the workflow publishes).

## Resources

- BTCMatic n8n integration guide: https://btcmatic.com/integrations/n8n
- BTCMatic API reference (OpenAPI): https://api.btcmatic.com/docs
- n8n community nodes: https://docs.n8n.io/integrations/community-nodes/

## License

[MIT](LICENSE)
