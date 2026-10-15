# Elixiré Commerce V3 — Storefront + Admin + Test Checkout

This is a functional **development/test** e-commerce project. It is not a production-ready payment processor. The three sample products, prices, stock quantities, photos and copy are placeholders.

## Folder structure

```
public/index.html             Customer storefront
public/admin/index.html       Separate admin dashboard
public/payment/index.html     Simulated hosted payment page
public/assets/style.css      Shared styling
public/assets/runtime.js     Cloudflare API + GitHub browser-preview adapter
public/assets/store.js       Cart, search, checkout, product details
public/assets/admin.js       Catalogue, orders, inventory, settings, activity
functions/api/[[path]].js     Cloudflare Pages Functions API
schema.sql                   New D1 database setup
migrate-v2-to-v3.sql         Migration ONLY for an existing V2 D1 database
```

## Option A — GitHub Pages: immediate browser preview

Upload **all contents of this ZIP** to the **root** of your existing GitHub repository, preserving the `public/`, `functions/`, and `schema.sql` paths.

If GitHub Pages is configured for branch `main`, folder `/ (root)`, open:

- `https://planniquedesignco.github.io/Elixire/public/`
- `https://planniquedesignco.github.io/Elixire/public/admin/`
- `https://planniquedesignco.github.io/Elixire/public/payment/` (only after checkout)

The frontend now uses **relative CSS/JS links**, so styling works from `/Elixire/public/`. GitHub preview **automatically switches to browser-local demo storage**. Admin preview password: **`demo123`**.

You can test creating/editing products, stock changes, cart, checkout, simulated successful/failed/cancelled payments, order management, fulfillment and shipping rules in the **same browser and origin**. Browser demo changes are NOT shared with other devices and can disappear when local storage is cleared. **`demo123` is NOT a production password.**

## Option B — Cloudflare Pages + D1: shared test backend

1. Cloudflare Dashboard → **Workers & Pages** → create a **Pages** project → **Connect to Git** → select `planniquedesignco/Elixire` and branch `main`.
2. Build settings: framework `None`, **build command empty**, **output directory `public`**, root directory `/`.
3. Deploy once. The site should appear at `https://YOUR-PROJECT.pages.dev/`. The admin is at `/admin/`.
4. Cloudflare Dashboard → **D1 SQL Database** → create a new database, e.g. `elixire-db`.
5. D1 database → Console: execute the entire `schema.sql` file. **Only run this on a new database.** For a V2 database use `migrate-v2-to-v3.sql` instead.
6. Pages project → **Settings → Bindings** → add **D1 database binding** with variable name **`DB`** and select your database.
7. Pages project → **Settings → Variables and Secrets**: add **`ADMIN_PASSWORD`** (secret; strong unique password), and **`ENABLE_TEST_GATEWAY`** with value **`true`** (test deployments only).
8. **Redeploy** after changing bindings or variables.
9. Test `https://YOUR-PROJECT.pages.dev/api/health`. Expect JSON `{ "ok": true, "mode": "test", "gateway": "simulation" }`.
10. Test the storefront and admin on Cloudflare. Product edits should show on other browsers after refreshing the storefront.

**Important:** Cloudflare Pages **Git integration** is required to deploy the Pages Functions from `functions/`. A GitHub Pages website cannot run this API or D1.

## Suggested testing checklist

- Storefront loads with styles and three products.
- Admin login works (GitHub preview: `demo123`; Cloudflare: `ADMIN_PASSWORD`).
- Create a new product with SKU, price, category, image URL, stock, visibility; refresh storefront.
- Edit price, stock, compare-at price; hide/unhide a product; refresh storefront.
- Search and sort products; add multiple items to cart; update quantities.
- Checkout with Malaysian shipping region and valid customer details.
- Simulate a successful payment; order becomes paid and inventory is reduced.
- Simulate a failed payment with a separate order; inventory is unchanged.
- Open admin → Orders → inspect customer details and update paid order fulfillment.
- Change shipping fees and announcement; refresh storefront.
- Open dashboard on a phone and check responsive layout.

## Security / production launch notes

This is a **test build**, not a live merchant checkout. No real money moves and no bank/card information is collected. Do not publish the test gateway as a live store or treat simulated payments as real revenue. Before launch: integrate a real gateway with authenticated server-side webhooks and signature verification; harden login (password hashing/identity provider, rate limiting, CSRF protection); protect order lookup with customer-specific authorization; enforce atomic stock reservations and idempotent payment transitions; implement tax/returns/privacy/terms, consent, email notifications, secure image uploads, backups, and shipping/courier integration. For Cloudflare, the public test gateway is enabled only while `ENABLE_TEST_GATEWAY=true`; disable it for production.

The demo admin password and sample data are solely for GitHub browser preview; Cloudflare uses its own server-side secret and database.


## V4 storefront update
New public routes: `/shop/`, `/story/`, `/journal/`, `/faq/`, `/shipping/`, `/contact/`. The homepage now features editorial content and links to these pages. Shared cart and checkout code is unchanged and works across storefront pages. The public-facing preview ribbon has been removed. GitHub Pages still stores orders and admin edits only in each browser; Cloudflare Pages + D1 is required for shared data. The contact page is an informational enquiry form only: it does not send emails until a real support address/backend is configured. Payment preview explicitly states that no funds are collected.


## V5 responsive refinement
Added public/assets/responsive.css and motion.js, loaded on all customer-facing pages. Improved typography at 320/360/390/430/768/1024px, overflow control, accessible animated mobile menu, reduced-motion support, subtle reveal effects, responsive product cards and modal layouts. Existing storefront/admin/API/database logic preserved.
