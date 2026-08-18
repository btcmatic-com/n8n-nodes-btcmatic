# TradingView signal + cheap-fee gate

A TradingView alert alone is noisy. This template combines it with the state of
the Bitcoin mempool: the alert only reaches you when the technical signal fires
**and** next-block fees are cheap. The combination is decided by the BTCMatic
engine — not by n8n — so every decision leaves an auditable evaluation trace
(`rsi 27 <= 30: pass; fee_next_block 4 < 5: pass`) in your fires history.

```
TradingView alert ──▶ n8n webhook ──▶ BTCMatic inbound hook
                                              │
                        rule: signal AND rsi≤30 AND fee_next_block<5
                              (fee read from BTCMatic's live mempool view)
                                              │
                                    Telegram + fires trace
                                              │ (optional)
                        n8n trigger ──▶ Google Sheets journal
```

> **Where does the fee come from?** You don't send it. `fee_next_block` is a
> canonical BTCMatic metric: the engine polls the Bitcoin mempool itself and
> evaluates the fee gate with its own fresh data *at decision time* — not with
> whatever the fee happened to be when the alert was sent. If the mempool feed
> is ever stale, the leaf reads `metric_unavailable` and the rule simply does
> not fire — it fails closed rather than deciding on old data.

## Prerequisites

- BTCMatic **Pro or Power** (API keys are a Pro+ feature).
- The [`n8n-nodes-btcmatic`](https://www.npmjs.com/package/n8n-nodes-btcmatic)
  node. It is a **verified community node**: on n8n Cloud just search for
  "BTCMatic" on the canvas and drag it in; self-hosted installs it under
  Settings → Community Nodes.
- A Telegram channel connected in BTCMatic (Settings → Channels).

## Setup

1. **API key** — BTCMatic Settings → API keys → create. Add it as the
   `BTCMatic API` credential in n8n (base URL `https://api.btcmatic.com`).
2. **Inbound hook** — Settings → Channels → Inbound hooks → create (or use the node's
   *Inbound Hook → Create* operation). Copy the **delivery path** and the
   **signing secret** — both are shown exactly once.
3. **Import `workflow-inbound.json`** and replace:
   - `hookUrl` → your hook's delivery path (`/hooks/whi_…/…`),
   - `signingSecret` → your hook's signing secret.
   Activate the workflow and copy the **production URL** of the
   *TradingView Alert* webhook node.
4. **TradingView alert** — on your RSI indicator/strategy, create an alert with
   *Webhook URL* = the n8n production URL and this message body:

   ```json
   {"signal": "rsi_oversold", "ticker": "{{ticker}}", "price": {{close}}, "rsi": {{plot_0}}, "time": "{{timenow}}"}
   ```

   (`{{plot_0}}` is the RSI value when the alert is attached to the RSI
   indicator; adjust the plot index to your indicator.)
5. **Rule** — create the rule from `rule.json` (replace `whi_REPLACE_ME` with
   your hook id) via the web builder's webhook trigger, or through the node's
   *Rule → Create* operation. The `throttle` is required for webhook-triggered
   rules — deliveries are externally paced, and the throttle is what makes a
   duplicate TradingView retry structurally unable to fire twice.
6. **Optional journal** — import `workflow-journal.json`, point it at a Google
   Sheet with a `Journal` tab, and activate it. The trigger node registers its
   URL as a BTCMatic webhook endpoint automatically; then set the rule's action
   to `webhook` and pick that endpoint in the rule editor (or add it as an
   additional per-user channel). Every fire lands as a row with the full
   evaluation trace.

## Tuning

- `fee_next_block < 5` (sat/vB) is aggressive; `< 10` fires more often.
  `fee_30m` (30-minute estimate) and `mempool_vsize` are also canonical and
  can gate the rule instead — all evaluated from the engine's live view.
- The rule's `throttle: "15m"` means at most one fire per 15 minutes no matter
  how many alerts TradingView sends.
- Want a sentiment gate too? `fear_greed_index` is canonical as well — add it
  as an extra leaf, no n8n changes needed.
- Condition metrics on a webhook rule resolve from your event's fields plus
  BTCMatic's canonical metrics. A field that never arrives evaluates
  `metric_unavailable` (visible in the fires trace) — if the rule never
  fires, the trace tells you exactly which leaf failed and why.

## Safety model

The API key can create rules and post events, but it can never place a live
order: `mode: live` is rejected on every API path, and API-created order rules
never auto-promote out of dry-run. This template's action is a notification —
the engine decides, you act.
