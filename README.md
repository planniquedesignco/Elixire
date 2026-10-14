# Elixiré Commerce — Cloudflare Pages + D1

## Architecture

- `public/` — separate customer storefront `/`, test gateway `/payment/`, admin `/admin/`
- `functions/api/[[path]].js` — server-side Pages Functions API
- `schema.sql` — database tables, shipping defaults and 3 placeholder products
- Cloudflare Pages is the hosting service; GitHub is the source repository and can auto-deploy changes. **GitHub Pages alone cannot run this backend.**

## Deploy to Cloudflare Pages from GitHub

1. Create a GitHub repository, upload all project files (not just `public/index.html`).
2. In Cloudflare dashboard > Workers & Pages > Create > Pages > Connect to Git > select repo.
3. Choose framework preset **None**; build command **blank**; build output directory **public**. The root `functions` directory is deployed automatically.
4. Create a D1 database (e.g. `elixire-db`) in Cloudflare dashboard.
5. Open your Pages project > Settings > Bindings > Add > D1 database. Variable name must be **DB**. Select `elixire-db`. Apply to Preview and Production environments as appropriate.
6. From your computer with Node.js and Wrangler installed, run `npx wrangler d1 execute elixire-db --remote --file=./schema.sql` while authenticated to the same Cloudflare account. Alternatively, paste the `schema.sql` statements into the D1 console in order. **Run seed SQL only once**.
7. In Pages project > Settings > Variables and Secrets, create **ADMIN_PASSWORD** as a secret with a strong unique password and **ENABLE_TEST_GATEWAY** as `true` (only for private testing). Configure both in the environment being tested.
8. Redeploy after changing bindings or variables. Check `/api/health`, then `/` and `/admin/`.
9. Use the Pages `*.pages.dev` preview URL to test before adding a client domain.

## End-to-end test

1. Sign in to `/admin/` with `ADMIN_PASSWORD`; change a product's name, stock or price.
2. Refresh `/` and verify the updated product appears.
3. Add to bag, checkout, fill in shipping and create an order.
4. On `/payment/`, simulate **success**. The order becomes `paid`, gets a `SIM-...` reference, and inventory is deducted.
5. In `/admin/` > Orders, review the order and set it to processing, shipped, or delivered, optionally adding courier/tracking.
6. Repeat with **failure** and **cancel**. Neither should deduct stock. Check Activity log.

## Limitations — NOT ready for public launch

- **Test gateway is intentionally accessible to anyone who has an order ID**. This is a demo, not a real payment callback. Set `ENABLE_TEST_GATEWAY=false` before any public launch; replace with a real gateway's server-verified, signed webhook, amount/currency checks, idempotency, and reconciliation.
- Pending orders do not reserve inventory; stock is deducted at simulated payment success. The demo does not yet handle high-concurrency inventory reservation/oversell edge cases, paid order refunds, stock returns, or real gateway settlement.
- Admin authentication is basic password + HTTP-only cookie. Before production add rate limiting, MFA or Cloudflare Access, session management, CSRF protections and granular permissions.
- Product images are external placeholder URLs; production image uploads and Cloudflare R2 are not yet integrated.
- No real courier booking, transactional emails, customer accounts, tax invoices, privacy policy, or full production compliance yet.
- Order lookup uses an unguessable order ID but has no customer authentication. Do not expose customer PII in public endpoints.
- Seed products, marketing copy, pricing, product claims, and shipping prices are placeholders and must be approved by the client.

## Payment integration plan

Real gateway flow: create pending order -> server creates payment session -> redirect to hosted gateway -> gateway sends authenticated webhook -> server verifies signature, reference, amount and currency -> transactionally mark paid and deduct/reserve stock -> customer sees verified status -> fulfillment begins. Browser redirects alone must never mark orders paid.
