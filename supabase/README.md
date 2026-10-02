# Maurilio Supabase

The `supabase/migrations/` directory mirrors the Maurilio migrations already
applied to the production-backed Supabase project.

Current Maurilio migration versions:

1. `20261001224255_create_maurilio_payment_core.sql`
2. `20261001224359_index_maurilio_entitlement_order_fk.sql`
3. `20261001225459_add_maurilio_stake_ars.sql`
4. `20261001230310_add_atomic_maurilio_matchday_publish.sql`
5. `20261001230741_add_maurilio_settlement_core.sql`
6. `20261001231110_add_maurilio_risk_snapshot.sql`
7. `20261001231244_harden_maurilio_publish_transition.sql`
8. `20261001231515_enforce_maurilio_publication_immutability.sql`
9. `20261001232514_enforce_maurilio_robust_lower_bound.sql`
10. `20261001233143_add_maurilio_event_start_gate.sql`
11. `20261001233859_add_maurilio_sale_risk_stop.sql`
12. `20261002000812_add_maurilio_append_only_audit.sql`
13. `20261002000829_audit_maurilio_publication_events.sql`
14. `20261002001148_add_maurilio_admin_login_throttle.sql`
15. `20261002002232_audit_maurilio_entitlement_events.sql`
16. `20261002002655_harden_maurilio_settlement_timing.sql`
17. `20261002002732_add_maurilio_checkout_idempotency.sql`
18. `20261002003532_add_maurilio_access_recovery_codes.sql`

The final migration contains the canonical publication RPC and immutability
triggers. Earlier publication migrations are retained to match applied migration
history.

## Invariant test

`tests/maurilio_invariants.sql` is transactional and rolls itself back. It
covers the critical lifecycle:

- valid Bet365 publication;
- immutable published pick;
- no next Matchday while a prior pick remains open;
- server-calculated settlement P&L;
- next Matchday allowed after settlement;
- canonical bankroll/risk snapshot;
- rejection of fragile signals whose lower probability bound has non-positive EV;
- rejection of late Bet365 captures and picks published after event start;
- publication/sale-stop/settlement audit events;
- append-only audit enforcement;
- irreversible risk stop at database level;
- distributed admin login lockout after repeated failures;
- entitlement grant/revoke audit events;
- historical entitlement persistence through Matchday settlement;
- revocation immediately disabling historical access;
- WIN/LOSS/PUSH settlement rejected before event start;
- VOID allowed before event start;
- one active checkout reservation per subject + Matchday + tier;
- repeated checkout requests reuse the same reservation instead of creating duplicate orders;
- single-use access recovery codes stored only as SHA-256 digests;
- recovery code expiry after 7 days;
- consumed recovery codes deleted immediately;
- recovery issuance and successful recovery audited append-only.

Run it only against a test/disposable environment or an explicitly authorized SQL
session.

## Access model

Maurilio tables are server-only:

- `anon`: no table access
- `authenticated`: no table access
- `service_role`: backend access

Sensitive RPCs are also service-role only:

- `maurilio_publish_bundle(jsonb)`
- `maurilio_settle_pick(text,text,numeric)`
- `maurilio_risk_snapshot()`
- `maurilio_close_pick_sale(text,text,numeric)`
- `maurilio_admin_login_gate(text,text)`
- `maurilio_reserve_order(text,uuid,text,text,numeric)`
- `maurilio_issue_recovery_code(uuid,text)`
- `maurilio_consume_recovery_code(text)`

Operational publication, sale-stop and settlement events are written to
`maurilio_audit_events`. The audit log is append-only at the database layer.

No service-role key may be exposed to the browser.


## Admin login protection

The Control Room does not store raw client IP addresses. The application derives
an HMAC throttle key using the server-only admin secret and sends only that digest
to Supabase.

Policy:

- 5 failed attempts per 15-minute window;
- 30-minute lockout after the fifth failure;
- distributed state across server instances;
- successful authentication clears the throttle record;
- if the security store is unavailable, production admin login fails closed.
