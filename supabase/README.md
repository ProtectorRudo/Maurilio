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
- rejection of fragile signals whose lower probability bound has non-positive EV.

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

No service-role key may be exposed to the browser.
