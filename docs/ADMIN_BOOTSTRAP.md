# Maurilio — First Admin Bootstrap

Maurilio admin privileges are stored in `public.maurilio_accounts.role`.
They are **not** read from user-editable Auth metadata.

## Procedure

1. Create the owner account through Maurilio normally.
2. Confirm the email and log in once so the account row exists.
3. In the Supabase SQL editor, identify the exact Auth user and promote only that row.

Example:

```sql
select id, email
from auth.users
where lower(email) = lower('<OWNER_EMAIL>');
```

Confirm that exactly one expected user is returned, then:

```sql
update public.maurilio_accounts
set role = 'admin',
    updated_at = now()
where user_id = '<CONFIRMED_USER_UUID>';
```

Verify:

```sql
select user_id, role, display_name
from public.maurilio_accounts
where user_id = '<CONFIRMED_USER_UUID>';
```

Expected role:

```
admin
```

## Rules

- Never create an endpoint that lets a user choose `admin`.
- Never authorize admin actions from `raw_user_meta_data`.
- Admin RPCs must still verify `auth.uid()` and the account role.
- Keep the admin console private/noindex.
- Moderation and payout state changes must remain auditable.
