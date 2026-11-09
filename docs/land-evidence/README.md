# Land workflow verification

Verified on 9 November 2026 against the running local app and real PostgreSQL demo.

- Type checking, lint, 41 Vitest tests, PostgreSQL integration checks, and production build passed.
- Browser checks covered 1440×900, 1024×900 and 390×900 in light/dark themes. No page overflow or JavaScript errors. The split-payment form accepted valid inputs and disabled save for overpayment.
- At 1440×900, Partners table client/scroll widths both measured 1087px; sidebar client/scroll heights both measured 691px. Reports and Setup links are visible without scrolling.
- Repeated demo seeding leaves one purchase, three payments, two costs and one contribution. Land asset 73,500,000 PKR; seller payable 25,000,000 PKR.
- PostgreSQL tests cover posting, one-voucher splits, overpayment, insufficient bank/cash, partner and lender identity, capital without double counting, edit rollback, payment/cost/contribution reversals, purchase edit/void, accountant permissions, immutable table grants, and deferred source totals. Test data rolls back.

## Screenshots

- Desktop light: [Land](land-1440-light.png), [two-source payment](payment-modal-final-1440-light.png), [payments](payments-1440-light.png).
- Desktop dark: [Land](land-1440-dark.png), [two-source payment](payment-modal-final-1440-dark.png), [payments](payments-1440-dark.png).
- Mobile light: [Land](land-390-light.png), [two-source payment, scrolled to sources and total](payment-modal-final-390-light.png), [payments in a horizontal scroll container](payments-390-light.png).
- Mobile dark: [Land](land-390-dark.png), [two-source payment, scrolled to sources and total](payment-modal-final-390-dark.png), [payments](payments-390-dark.png).
- 1024px light: [Land](land-1024-light.png), [payment](payment-modal-final-1024-light.png), [payments](payments-1024-light.png).
- 1024px dark: [Land](land-1024-dark.png), [payment](payment-modal-final-1024-dark.png), [payments](payments-1024-dark.png).
- [Partners and sidebar at 1440×900](partners-1440.png).
- [Measured browser results](verification.json).

Mobile forms scroll vertically; wide payment/cost tables scroll within their container. A non-blocking existing production-bundle size warning remains. Purchase edits/voids also require linked costs to be voided; costs for contributed parcels are recorded project-wide because the requested cost model links to purchases, not parcels.
