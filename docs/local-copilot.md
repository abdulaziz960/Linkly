# Employee Copilot without API charges

Linkly supports self-hosted Ollama for its **managed employee Copilot**. This does not include free compute, change subscription entitlements, enable AI automatically, or promise model quality. Existing BYOK providers remain unchanged. Local mode never falls back to Gemini or any other cloud provider.

## Provisioning (operator action, not performed by this change)

1. Choose an appropriately licensed, locally downloadable model with Arabic capability and benchmark it on synthetic support conversations. Set the exact installed model tag; there is deliberately no automatic download or model default.
2. Run Ollama on an existing machine or a dedicated private inference server. Set `OLLAMA_NO_CLOUD=1` **in Ollama's own environment**, restart it, and verify local-only mode. Reject cloud model aliases operationally as well as in application configuration.
3. Keep its API off the public internet. Bind locally or use a private network, firewall, and authenticated reverse proxy for remote access. Never expose port 11434 publicly. Application egress must also prohibit public model services if strict local-only assurance is required.
4. Set on the Linkly application server:

```dotenv
AI_MANAGED_PROVIDER=ollama
OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_MODEL=YOUR_INSTALLED_LOCAL_MODEL_TAG
# Optional bearer authentication for a private reverse proxy; never NEXT_PUBLIC:
OLLAMA_PROXY_TOKEN=
```

Only loopback or private literal IPv4/IPv6 origins are accepted, not URLs supplied by tenants. For a remote host use its private IP and preferably HTTPS with a valid certificate for that address. Do not disable certificate validation. The URL must be an origin, without credentials, path, query or fragment. Redirects are rejected.

On Cloud Run, `127.0.0.1` is the container network, **not the employee's computer**. Configure private connectivity to the inference server or deliberately provision a suitable sidecar. Neither is provisioned here, and infrastructure charges require a separate decision.

5. Ensure the tenant's current plan has positive `aiDailyLimit` and `aiMonthlyLimit`. These existing entitlements remain enforced atomically; failed requests count. Set modest quotas appropriate to the available hardware.
6. As workspace owner open **AI Copilot settings** and enable the managed assistant. If a BYOK key exists, the explicit switch button asks for confirmation and clears it, so the old paid provider is not silently used. The connection-configured label is not a health check.
7. In an assigned conversation choose a tool, request a suggestion, review it, and manually use/send it. Local mode is intentionally limited to this employee endpoint, not bot auto-replies or background summaries.

## What to verify before enabling production data

- Synthetic Arabic and English: reply, rewrite, correction, translation, summary, sentiment, next step. Check facts and quality manually; small models may underperform.
- Unassigned employee and another tenant cannot request a suggestion; internal notes are excluded from inference input.
- A local 429/500/timeout produces no suggestion and **no cloud request**. No message is sent automatically.
- The requested model is installed and runs with cloud disabled; validate network egress.
- Zero API cost in usage events means model API fees only; hardware, hosting and operations are not included.
- Cold-start latency fits the 60-second local request timeout and available host memory. Load-test in staging, not production.

References: [Ollama chat API](https://docs.ollama.com/api/chat), [local-only mode](https://docs.ollama.com/faq). Gemini free-tier handling is different: review [Google's pricing and data-use table](https://ai.google.dev/gemini-api/docs/pricing) before sending customer conversations to a free cloud tier.
