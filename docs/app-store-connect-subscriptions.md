# App Store Connect — Elevio Subscriptions Setup

## Subscription Group

**Name:** Elevio Plans

## Products

| Product ID | Reference Name | Subscription Duration | Price (placeholder) |
|---|---|---|---|
| `com.elevio.starter.monthly` | Starter Monthly | 1 month | 29 CAD |
| `com.elevio.starter.annual` | Starter Annual | 1 year | 290 CAD |
| `com.elevio.pro.monthly` | Pro Monthly | 1 month | 79 CAD |
| `com.elevio.pro.annual` | Pro Annual | 1 year | 790 CAD |

## Setup Steps

1. **App Store Connect** → Your App → Subscriptions
2. Create **Subscription Group** named "Elevio Plans"
3. Add the 4 products above
4. Set pricing (start with CAD, add other currencies later)
5. Add **Subscription Display Name** and **Description** in FR + EN
6. Add **App Store Review Information** (review screenshot, notes)
7. Submit for review with the app binary

## Important Notes

- **Starter and Pro must be in the same Subscription Group** so users can upgrade/downgrade
- **Business and Enterprise are NOT IAP** — they use activation codes or direct sales
- **Free tier** is the default — no IAP required, no trial
- **Intro offers** can be added later (e.g. 7-day free trial for Starter)
- **Family Sharing**: disabled by default (construction tool, single-user)
- **Product IDs** are defined in `lib/billing/productIds.ts` — change there if needed before first submission

## RevenueCat Integration (future)

When Capacitor is set up:
1. Create RevenueCat project at revenuecat.com
2. Configure App Store Connect Shared Secret
3. Add the 4 product IDs in RevenueCat dashboard
4. Install `@revenuecat/purchases-capacitor` plugin
5. Replace mock functions in `lib/billing/revenuecat.ts` with real SDK calls
6. Server-side validation via RevenueCat REST API

## Activation Codes (Business/Enterprise)

Codes are stored in `enterprise_activation_codes` table.
Generate codes via SQL:

```sql
INSERT INTO enterprise_activation_codes (code, company_name, plan, max_projects, max_operators, expires_at)
VALUES ('ELEV-ENT-DEMO1', 'Demo Company', 'enterprise', NULL, NULL, NOW() + INTERVAL '1 year');
```

Admin can view/revoke codes via direct DB access or future admin page.
