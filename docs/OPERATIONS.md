# Maurilio — Daily Operations Runbook

This runbook describes the production workflow for a Matchday.

## 1. Open the Control Room

Production access is available at:

```
/maurilio/control-room
```

The panel requires a valid signed admin session created from the server-only
`MAURILIO_ADMIN_SECRET`. Sessions expire automatically.

## 2. Check bankroll and risk budget

The Control Room reads a canonical server-side risk snapshot:

- live bankroll
- cumulative P&L
- ROI on actual stake
- average Bet365 CLV
- open exposure
- settled pick count

Risk invariants:

- maximum stake per pick: 2% of live bankroll
- maximum simultaneous exposure: 6%
- stake ARS must match the declared stake percentage within rounding tolerance
- no martingale/chasing logic exists in the product

## 3. Build the Matchday

A Matchday may contain one pick per tier:

- FREE
- PRO
- ELITE

A tier can be disabled. It is valid to publish only FREE, FREE + PRO, etc.

Required fields for every published pick:

- unique public ID
- competition
- event
- market
- selection when applicable
- Bet365 entry odds
- minimum acceptable odds
- own probability
- probability range
- positive EV at the lower bound of the probability range
- stake percentage
- stake ARS
- thesis
- strongest reason not to enter
- Bet365 capture timestamp

Publication is rejected when any of these rules fail:

- bookmaker is not Bet365
- entry odds are below minimum odds
- own probability/range is invalid
- central EV is not positive
- lower-bound EV is not positive (fragile signal)
- stake is <= 0 or > 2%
- simultaneous exposure is > 6%
- stake ARS and stake % disagree with live bankroll
- required audit fields are missing
- another Matchday still has open picks

## 4. NO VALUE day

If no candidate survives the process, publish the Matchday with:

```
NO VALUE = true
```

The public site will show:

```
HOY NO HAY APUESTA CON SUFICIENTE VALOR
```

No premium tier is sellable on a NO VALUE Matchday.

## 5. Publication is immutable

Publication is a one-way audit event.

After a pick is published, the database rejects changes to:

- event
- market
- selection
- Bet365 entry odds
- minimum odds
- model probability/range
- stake
- thesis
- principal risk
- capture time
- publication timestamp

A published Matchday cannot be republished under the same slug.

Only settlement fields and lifecycle status may change afterward.

## 6. Premium purchase path

A premium tier is purchasable only if:

1. an active Matchday exists;
2. that tier has a published pick;
3. checkout is explicitly enabled;
4. Mercado Pago credentials and Supabase server credentials are configured.

Payment flow:

1. order is persisted locally;
2. Mercado Pago order is created;
3. buyer is redirected;
4. webhook signature is validated;
5. order is fetched independently from Mercado Pago;
6. provider ID, external reference and amount must match;
7. entitlement is granted only after accredited payment.

Browser return URLs never unlock premium content.

Refund/cancel/failure revokes access.

## 7. Settlement

In Control Room → Post-Match, enter:

- result: WIN / LOSS / PUSH / VOID
- Bet365 closing odds (required except VOID)

P&L is calculated by the server:

- WIN = stake × (entry odds − 1)
- LOSS = −stake
- PUSH = 0
- VOID = 0

The operator cannot type arbitrary P&L.

When no published picks remain open, the Matchday becomes `settled`.

## 8. Public ledger

Only settled picks appear in the real public ledger.

Metrics are calculated from the canonical risk snapshot, not from the visible
table page size:

- bankroll
- P&L
- ROI
- average CLV

CLV is calculated from Bet365 entry vs Bet365 closing price.

## 9. Production fail-closed rules

- If the database is configured but no Matchday is active, the home shows
  “Próximo Matchday en preparación”; demo picks are never presented as real.
- If no premium pick is published, that tier cannot be bought.
- If checkout credentials are missing, checkout remains disabled.
- If webhook verification fails, entitlement is not granted.
- If admin authentication is unavailable in production, Control Room is not exposed.

## 10. End-of-day audit

Before closing a Matchday:

1. settle every open pick;
2. verify closing Bet365 price;
3. verify P&L;
4. inspect CLV;
5. inspect bankroll and exposure;
6. confirm public ledger entry;
7. write any model learning separately — never rewrite the original prediction.
