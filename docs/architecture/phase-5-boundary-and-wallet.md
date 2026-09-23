# Phase 5 — platform boundary and real wallet

`PlatformAdminModule` no longer imports `SmartPublishingModule`. Catalog feeds, AI settings, and source-fetch go through `PlatformPublishingPort`.

Token charges use the integer `UsageMetricDefinition.unitCost`. Each month the tenant plan grants starter 500, professional 5000, or enterprise 50000 tokens. A super admin can credit tokens, and a pending payment intent credits the wallet only when confirmed. There is no live payment gateway yet; a gateway should call `confirmPayment`.

Priced jobs are refused when `balanceTokens - reservedTokens` is below the price, unless `BILLING_ENFORCE=false`. Fetch and poll stay free. `retryAllDead` reserves again.
