# Maurilio — Daily Operations Runbook

This runbook describes the production workflow for a Matchday.

## 1. Open the Control Room

Production access is available at:

```
/maurilio/control-room
```

The panel requires a valid signed admin session created from the server-only
`MAURILIO_ADMIN_SECRET`. Sessions expire automatically.

Login protection is distributed through Supabase. Five failed attempts inside
15 minutes trigger a 30-minute lockout. Raw IP addresses are not persisted;
the server sends only an HMAC-derived throttle key to the database.

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
- event start timestamp

Publication is rejected when any of these rules fail:

- bookmaker is not Bet365
- entry odds are below minimum odds
- own probability/range is invalid
- central EV is not positive
- lower-bound EV is not positive (fragile signal)
- Bet365 capture is not before event start
- event has already started
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
3. the event has not started;
4. checkout is explicitly enabled;
5. Mercado Pago credentials and Supabase server credentials are configured.

At event start, premium sales close automatically. Existing verified entitlements
remain valid for audit/review of the purchased report.

Before event start, the operator can also trigger an irreversible sale risk stop
when Bet365 falls below the published minimum odds, the market disappears, or new
material information invalidates the entry conditions. A price-based stop requires
a freshly observed Bet365 quote below the immutable minimum price.

Payment flow:

1. order is persisted locally;
2. Mercado Pago order is created;
3. buyer is redirected;
4. webhook signature is validated;
5. order is fetched independently from Mercado Pago;
6. provider ID, external reference and amount must match;
7. entitlement is granted only after accredited payment.

Browser return URLs never unlock premium content.

Checkout reservation is idempotent per browser subject + Matchday + tier. Repeated
clicks reuse one active local order instead of creating parallel Mercado Pago
orders. A stale reservation that never obtained a provider checkout URL is released
after five minutes.

Refund/cancel/failure revokes access.

Verified buyers also have a `/maurilio/access` library. The entitlement is tied
to the exact Matchday and tier purchased, so a settled historical report remains
reviewable without granting access to any later Matchday. A revoked entitlement
immediately loses historical access as well.

## 7. Settlement

In Control Room → Post-Match, enter:

- result: WIN / LOSS / PUSH / VOID
- Bet365 closing odds (required except VOID)

P&L is calculated by the server:

- WIN = stake × (entry odds − 1)
- LOSS = −stake
- PUSH = 0
- VOID = 0

WIN / LOSS / PUSH are rejected before the event start timestamp. VOID is allowed
before kickoff for cancelled/invalidated entries.

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

## 10. Immutable audit timeline

The Control Room exposes the append-only operational log for:

- Matchday publication;
- pick publication;
- premium sale risk stop;
- pick settlement;
- entitlement grant;
- entitlement revoke/expiry.

The underlying audit rows cannot be updated or deleted. This is separate from the
public ledger and exists to prove the operational sequence.

## 11. End-of-day audit

Before closing a Matchday:

1. settle every open pick;
2. verify closing Bet365 price;
3. verify P&L;
4. inspect CLV;
5. inspect bankroll and exposure;
6. confirm public ledger entry;
7. write any model learning separately — never rewrite the original prediction.


## Cross-device buyer recovery

Premium access is normally identified by the HTTP-only `maurilio_sid` cookie.
A verified buyer can generate a Recovery Code from `/maurilio/access`.

Security properties:

- the browser sees the raw code only when it is generated;
- the database stores only a SHA-256 digest;
- each code expires after 7 days;
- each code is single-use and is deleted when redeemed;
- generating a new code replaces the previous code for that buyer subject;
- redemption never uses a URL token, so the code is not exposed in browser history,
  link previews, analytics URLs or referrer headers;
- successful issuance and redemption are recorded in the append-only audit trail;
- recovery restores only the same subject and its existing active entitlements;
  it does not create new premium rights.

Premium and buyer routes use `private, no-store`, `noarchive` and
`Referrer-Policy: no-referrer` headers.


## Pseudonymous Access Tag

Every premium response and historical report includes a short Access Tag derived
from the random buyer subject UUID. The raw subject UUID is never rendered.

The tag is stable across devices restored with the same Recovery Code lineage, so
shared screenshots can be attributed to an access subject without collecting a
name, email address, phone number or other personal identifier. The tag is a
deterrence/audit mechanism, not a claim that screenshots can be technically
prevented.
