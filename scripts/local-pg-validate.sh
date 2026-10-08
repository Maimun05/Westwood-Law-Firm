#!/usr/bin/env bash
# =============================================================================
# Apply the whole migration chain to a throwaway PostgreSQL cluster and assert
# the security properties still hold.
#
#   bash scripts/local-pg-validate.sh
#
# Why this exists: reading SQL is not the same as running it. Four separate bugs
# in this repo survived careful review and only surfaced on execution, and
# `CREATE OR REPLACE` in an older file has twice silently reverted a newer
# hardening fix. Run this before handing any migration to the owner.
#
# There is no Docker on this machine, so `supabase start` is unavailable. This
# builds the smallest Supabase-shaped environment the migrations actually need.
# =============================================================================

set -uo pipefail

PG_BIN="${PG_BIN:-/c/Program Files/PostgreSQL/18/bin}"
PORT="${PORT:-55440}"
WORKDIR="${WORKDIR:-$(mktemp -d -t wlfpg-XXXXXX)}"
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PASSES="${PASSES:-2}"

export PATH="$PG_BIN:$PATH"
export PGPASSWORD=postgres

FAILURES=0
pass() { echo "  PASS  $1"; }
fail() { echo "  FAIL  $1"; FAILURES=$((FAILURES + 1)); }

cleanup() {
  pg_ctl -D "$WORKDIR/data" stop -m immediate >/dev/null 2>&1
  rm -rf "$WORKDIR"
}
trap cleanup EXIT

echo "== 1. Cluster =="
initdb -D "$WORKDIR/data" -U postgres --auth=trust >/dev/null 2>&1 || { echo "initdb failed"; exit 1; }
# No -k: the socket directory has to be a native Windows path, and on Windows
# the client talks over TCP anyway.
pg_ctl -D "$WORKDIR/data" -o "-p $PORT" -l "$WORKDIR/log" start >/dev/null 2>&1 || { cat "$WORKDIR/log"; exit 1; }
for _ in $(seq 1 30); do pg_isready -h 127.0.0.1 -p "$PORT" -q && break; sleep 0.3; done
echo "  up on port $PORT (workdir $WORKDIR)"

PSQL="psql -h 127.0.0.1 -p $PORT -U postgres -d postgres -v ON_ERROR_STOP=1 -q"

echo "== 2. Supabase stub =="
$PSQL <<'SQL'
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon')          THEN CREATE ROLE anon          NOLOGIN NOINHERIT; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN NOINHERIT; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role')  THEN CREATE ROLE service_role  NOLOGIN NOINHERIT BYPASSRLS; END IF;
END $$;

CREATE SCHEMA IF NOT EXISTS auth;
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE SCHEMA IF NOT EXISTS storage;
CREATE EXTENSION IF NOT EXISTS pgcrypto SCHEMA extensions;

-- Columns mirror the real GoTrue table closely enough for the migrations.
-- 20261001 backfills auth.users from profiles and writes all of these, so a
-- trimmed-down stub fails with "column instance_id does not exist".
CREATE TABLE IF NOT EXISTS auth.users (
  instance_id          UUID,
  id                   UUID PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  aud                  TEXT,
  role                 TEXT,
  email                TEXT UNIQUE,
  encrypted_password   TEXT,
  email_confirmed_at   TIMESTAMPTZ,
  raw_app_meta_data    JSONB DEFAULT '{}'::JSONB,
  raw_user_meta_data   JSONB DEFAULT '{}'::JSONB,
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  updated_at           TIMESTAMPTZ DEFAULT NOW(),
  confirmation_token   TEXT,
  email_change         TEXT,
  email_change_token_new TEXT,
  recovery_token       TEXT
);

-- auth.uid() reads the request JWT claim, which psql has no way to set. The
-- tests below set a session GUC and these functions read it, which is the
-- standard trick for exercising RLS outside PostgREST.
CREATE OR REPLACE FUNCTION auth.uid() RETURNS UUID LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', TRUE), '')::UUID;
$$;
CREATE OR REPLACE FUNCTION auth.role() RETURNS TEXT LANGUAGE sql STABLE AS $$
  SELECT COALESCE(NULLIF(current_setting('request.jwt.claim.role', TRUE), ''), 'anon');
$$;
CREATE OR REPLACE FUNCTION auth.jwt() RETURNS JSONB LANGUAGE sql STABLE AS $$
  SELECT COALESCE(NULLIF(current_setting('request.jwt.claims', TRUE), '')::JSONB, '{}'::JSONB);
$$;

CREATE TABLE IF NOT EXISTS storage.buckets (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, public BOOLEAN DEFAULT FALSE,
  file_size_limit BIGINT, allowed_mime_types TEXT[], created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS storage.objects (
  id UUID PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  bucket_id TEXT REFERENCES storage.buckets(id),
  name TEXT, owner_id TEXT, metadata JSONB, created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Supabase ships storage.foldername()/storage.filename() for writing path-based
-- storage policies; the stub must too, or a policy that uses them (20261016's
-- avatar policies key on the first folder being the owner's uid) dies with
-- "function storage.foldername(text) does not exist" — a harness gap that looks
-- exactly like a migration bug. Body copied from the real Supabase definition.
CREATE OR REPLACE FUNCTION storage.foldername(name TEXT) RETURNS TEXT[] LANGUAGE plpgsql AS $$
DECLARE
  _parts TEXT[];
BEGIN
  SELECT string_to_array(name, '/') INTO _parts;
  RETURN _parts[1:array_length(_parts, 1) - 1];
END $$;

-- Supabase Vault, for 20261015. The real extension encrypts secrets with a root
-- key held outside the database; this stub stores them in plain text, which is
-- enough to exercise the wrapper/RLS path but proves nothing about the real
-- encryption. 20261015's preflight refuses to run without these objects, so
-- without the stub the whole chain (and the combined paste file) aborts.
CREATE SCHEMA IF NOT EXISTS vault;
CREATE TABLE IF NOT EXISTS vault.secrets (
  id UUID PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  name TEXT UNIQUE,
  secret TEXT,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE OR REPLACE VIEW vault.decrypted_secrets AS
  SELECT id, name, description, secret AS decrypted_secret, created_at
  FROM vault.secrets;
CREATE OR REPLACE FUNCTION vault.create_secret(
  new_secret TEXT, new_name TEXT DEFAULT NULL, new_description TEXT DEFAULT NULL
) RETURNS UUID LANGUAGE plpgsql AS $$
DECLARE v UUID;
BEGIN
  INSERT INTO vault.secrets(name, secret, description)
  VALUES (new_name, new_secret, new_description)
  RETURNING id INTO v;
  RETURN v;
END $$;

-- Supabase grants anon/authenticated/service_role blanket table privileges in
-- public and lets RLS be the only gate. Without this the harness reports
-- "permission denied for table X" for every insert and the RLS assertions are
-- meaningless. Must run BEFORE schema-production.sql creates the tables.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES    TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;
SQL
[ $? -eq 0 ] || { echo "  stub failed"; exit 1; }
echo "  roles, auth schema, storage schema, pgcrypto, vault stub"

echo "== 3. Base schema =="
$PSQL -f "$REPO/supabase/schema-production.sql" >/dev/null 2>"$WORKDIR/base.err"
if [ $? -ne 0 ]; then echo "  FAILED:"; tail -20 "$WORKDIR/base.err"; exit 1; fi
echo "  schema-production.sql applied"

# The live database was built up with ad-hoc scripts, so audit_logs does not
# match what schema-production.sql declares. Reshape it the way the live
# project already is, or the chain fails for the wrong reason.
#
# inquiries is deliberately NOT touched here. An earlier version of this
# prelude added `inquiries.user_id`, on the belief that live had it. It does
# not (probe: GET /rest/v1/inquiries?select=user_id returns 42703), and adding
# it made 20261005/20261006 pass locally while the same statements died on the
# live project with `column "user_id" does not exist`. The prelude must mirror
# the live shape, never invent a friendlier one.
echo "== 4. Live-shape prelude =="
$PSQL <<'SQL'
DROP TABLE IF EXISTS public.audit_logs CASCADE;
CREATE TABLE public.audit_logs (
  id UUID PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  user_email TEXT, user_role TEXT,
  event_type TEXT NOT NULL, event_description TEXT NOT NULL,
  resource_type TEXT, resource_id TEXT, metadata JSONB,
  ip_address TEXT, user_agent TEXT, success BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
SQL
[ $? -eq 0 ] || { echo "  prelude failed"; exit 1; }
echo "  audit_logs reshaped (inquiries left at its real live shape)"

echo "== 5. Migration chain, $PASSES passes =="
mapfile -t FILES < <(ls "$REPO/supabase/migrations/"*.sql | sort)
for pass in $(seq 1 "$PASSES"); do
  for f in "${FILES[@]}"; do
    $PSQL -f "$f" >/dev/null 2>"$WORKDIR/mig.err"
    if [ $? -ne 0 ]; then
      echo "  FAIL  pass $pass: $(basename "$f")"
      tail -15 "$WORKDIR/mig.err"
      exit 1
    fi
  done
  echo "  pass $pass: all ${#FILES[@]} migrations applied with zero errors"
done

# The individual files are not the artifact the owner runs. He pastes the
# combined file into the Supabase SQL Editor, so that is what has to be proven
# to execute. A generator bug once emitted bare '####' banner lines, which
# Postgres read as an operator and rejected before running a single statement —
# while every individual migration passed this harness.
echo "== 5b. Combined APPLY_PENDING_MIGRATIONS.sql =="
COMBINED="$REPO/supabase/APPLY_PENDING_MIGRATIONS.sql"
if [ ! -f "$COMBINED" ]; then
  fail "combined file is missing"
else
  if $PSQL -f "$COMBINED" >/dev/null 2>"$WORKDIR/combined.err"; then
    pass "combined file executes cleanly ($(wc -l < "$COMBINED" | tr -d ' ') lines)"
  else
    fail "combined file failed to execute"
    grep -i error "$WORKDIR/combined.err" | head -5
  fi

  # The owner reads the result grid at the bottom of the file, not the logs.
  # A FAIL there is the only signal he gets, so prove it cannot appear.
  sed -n '/## VERIFICATION/,$p' "$COMBINED" > "$WORKDIR/verify.sql"
  $PSQL -f "$WORKDIR/verify.sql" > "$WORKDIR/verify.out" 2>&1
  if grep -q 'FAIL' "$WORKDIR/verify.out"; then
    fail "the combined file's own verification grid reports FAIL"
    grep -B2 'FAIL' "$WORKDIR/verify.out" | head -20
  else
    pass "the combined file's verification grid reports no FAIL"
  fi
fi

# ── 5b-ii. The live failure of 2026-09-30: an auth user with no profile row ──
# The owner's run died with
#   23505 duplicate key value violates unique constraint "users_email_partial_key"
# because the seeded lawyer auth users already existed while their profiles rows
# did not (the on_auth_user_created trigger was never installed on that project),
# so the seed's profiles-only lookup missed and it re-inserted an existing email.
# Reproduce that exact state and require the combined file to recover from it.
if [ -f "$COMBINED" ]; then
  $PSQL -q -c "DELETE FROM public.profiles WHERE lower(email) = 'atty.boyet@westwoodlaw.ph';" >/dev/null 2>&1
  LEFT=$($PSQL -tA -c "SELECT count(*) FROM public.profiles WHERE lower(email) = 'atty.boyet@westwoodlaw.ph';" 2>&1 | tr -d '[:space:]')
  if [ "$LEFT" != "0" ]; then
    fail "harness: could not remove the seeded lawyer profile (got '$LEFT' rows)"
  elif $PSQL -f "$COMBINED" >/dev/null 2>"$WORKDIR/recover.err"; then
    GOT=$($PSQL -tA -c "SELECT role FROM public.profiles WHERE lower(email) = 'atty.boyet@westwoodlaw.ph';" 2>&1 | tr -d '[:space:]')
    if [ "$GOT" = "lawyer" ]; then
      pass "seed recovers an auth user whose profile row is missing"
    else
      fail "seed recovers an auth user whose profile row is missing (role is '$GOT')"
    fi
  else
    fail "re-applying the combined file over a missing profile row failed"
    grep -i error "$WORKDIR/recover.err" | head -3
  fi
fi

# Reproduces the Supabase dashboard linter (see supabase/tests/security-advisor-replica.sql)
# so "did the fix work?" is answered here instead of by pasting into the SQL
# Editor and refreshing the dashboard.
#
# ACCEPTED holds findings that are deliberate. Anything not on this list fails
# the run, so a new policy that trips a check cannot slip in unnoticed.
echo "== 5c. Security advisor replica =="
ACCEPTED="security_definer_view|public_lawyers
public_execute_security_definer|break_glass_open_document
public_execute_security_definer|convert_inquiry_to_matter
public_execute_security_definer|submit_inquiry
public_execute_security_definer|attach_inquiry_files
multiple_permissive_policies|audit_logs / SELECT
multiple_permissive_policies|documents / UPDATE
multiple_permissive_policies|inquiries / UPDATE
multiple_permissive_policies|matter_notes / INSERT
multiple_permissive_policies|matters / UPDATE
multiple_permissive_policies|profile_practice_areas / ALL
multiple_permissive_policies|profiles / UPDATE"

ADVISOR="$WORKDIR/advisor.txt"
$PSQL -tA -F '|' -f "$REPO/supabase/tests/security-advisor-replica.sql" > "$ADVISOR" 2>"$WORKDIR/advisor.err"
if [ $? -ne 0 ]; then
  fail "advisor replica failed to run"
  tail -5 "$WORKDIR/advisor.err"
else
  TOTAL=$(grep -c . "$ADVISOR" || true)
  UNEXPECTED=0
  while IFS= read -r line; do
    [ -z "$line" ] && continue
    if echo "$ACCEPTED" | grep -qxF "$(echo "$line" | cut -d'|' -f1,2)"; then
      echo "  accept  $line"
    else
      echo "  FAIL    $line"
      UNEXPECTED=$((UNEXPECTED + 1))
    fi
  done < "$ADVISOR"
  if [ "$UNEXPECTED" -eq 0 ]; then
    pass "no unexpected advisor findings ($TOTAL total, all accepted)"
  else
    FAILURES=$((FAILURES + UNEXPECTED))
    echo "        $UNEXPECTED unexpected finding(s)"
  fi
fi

echo "== 6. Behaviour assertions =="
# Fixtures. Two traps here:
#   1. Inserting into auth.users fires handle_new_user(), which creates a
#      profiles row with the default 'client' role. A plain
#      `ON CONFLICT DO NOTHING` on profiles is therefore a no-op and every
#      fixture silently stays a client. Use DO UPDATE so the final state is
#      what this script intends regardless of insert order.
#   2. The last-admin guard fires on profiles, so it is disabled while seeding.
$PSQL >/dev/null 2>"$WORKDIR/fix.err" <<'SQL'
ALTER TABLE public.profiles DISABLE TRIGGER USER;
ALTER TABLE public.matter_notes DISABLE TRIGGER USER;

INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-0000-0000-0000000000a1', 'admin@wlf.test'),
  ('00000000-0000-0000-0000-0000000000b1', 'lawyer@wlf.test'),
  ('00000000-0000-0000-0000-0000000000b2', 'lawyer2@wlf.test'),
  ('00000000-0000-0000-0000-0000000000c1', 'client@wlf.test'),
  ('00000000-0000-0000-0000-0000000000c2', 'stranger@wlf.test');

INSERT INTO public.profiles (id, email, role, full_name, first_name, last_name, is_active) VALUES
  ('00000000-0000-0000-0000-0000000000a1', 'admin@wlf.test',   'admin',   'Ada Admin',   'Ada',   'Admin',   TRUE),
  ('00000000-0000-0000-0000-0000000000b1', 'lawyer@wlf.test',  'lawyer',  'Lito Lawyer', 'Lito',  'Lawyer',  TRUE),
  ('00000000-0000-0000-0000-0000000000b2', 'lawyer2@wlf.test', 'lawyer',  'Lena Lawyer', 'Lena',  'Lawyer',  TRUE),
  ('00000000-0000-0000-0000-0000000000c1', 'client@wlf.test',  'client',  'Cora Client', 'Cora',  'Client',  TRUE),
  ('00000000-0000-0000-0000-0000000000c2', 'stranger@wlf.test','client',  'Sam Stranger','Sam',   'Stranger',TRUE)
ON CONFLICT (id) DO UPDATE SET
  role = EXCLUDED.role, full_name = EXCLUDED.full_name,
  first_name = EXCLUDED.first_name, last_name = EXCLUDED.last_name,
  is_active = EXCLUDED.is_active;

INSERT INTO public.matters (id, matter_number, title, description, client_id, lawyer_id, practice_area, status, priority)
VALUES
  ('00000000-0000-0000-0000-0000000000e1', 'M-001', 'Client matter',  'Fixture matter owned by the client.',   '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000b1', 'labor', 'Active', 'Medium'),
  ('00000000-0000-0000-0000-0000000000e2', 'M-002', 'Stranger matter','Fixture matter owned by someone else.', '00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000b1', 'labor', 'Active', 'Medium')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.matter_members (matter_id, lawyer_id) VALUES
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000b2')
ON CONFLICT DO NOTHING;

ALTER TABLE public.profiles ENABLE TRIGGER USER;
ALTER TABLE public.matter_notes ENABLE TRIGGER USER;
SQL
[ $? -eq 0 ] || { echo "  FAIL  fixtures"; tail -20 "$WORKDIR/fix.err"; exit 1; }
echo "  2 matters (one owned by the client, one not), 2 lawyers, 1 team member"

# try_as <label> <user-uuid> <expect: allow|deny> <sql> [role]
#
# ONLY for INSERT. An INSERT that RLS refuses raises an error, so exit status
# is a reliable signal. UPDATE and DELETE do NOT behave that way: a row the
# policy hides is simply not matched, the statement affects zero rows and exits
# 0. Use deny_mutation for those.
#
# role defaults to authenticated; pass `anon` with an empty uid to act as a
# signed-out visitor.
#
# The ROW_COUNT guard catches the other trap: a statement that matched nothing
# for an unrelated reason (wrong id, missing fixture) would otherwise read as
# "the database allowed it". This mistake has been made twice in this repo.
try_as() {
  local label="$1" uid="$2" expect="$3" sql="$4" role="${5:-authenticated}"
  local out rc

  out=$($PSQL -c "SET request.jwt.claim.sub = '$uid'; SET ROLE $role;
    DO \$try\$ DECLARE n INT; BEGIN
      $sql
      GET DIAGNOSTICS n = ROW_COUNT;
      IF n = 0 THEN RAISE EXCEPTION 'HARNESS_NO_ROWS'; END IF;
    END \$try\$;" 2>&1)
  rc=$?

  if echo "$out" | grep -q HARNESS_NO_ROWS; then
    fail "$label — harness error: the statement matched no rows, so nothing was proven"
    return
  fi

  if [ "$expect" = "allow" ]; then
    if [ $rc -eq 0 ]; then pass "$label"; else fail "$label (should be allowed)"; echo "        $(echo "$out" | grep -i error | head -1)"; fi
  else
    if [ $rc -ne 0 ]; then pass "$label"; else fail "$label (should have been denied)"; fi
  fi
}

# deny_mutation <label> <user-uuid> <mutation-sql> <verify-sql> <expected>
#
# For UPDATE/DELETE, a blocked statement is silent: the policy hides the row,
# nothing matches, and the statement exits 0. Assert on the row's state
# afterwards instead of on the exit status.
deny_mutation() {
  local label="$1" uid="$2" mutation="$3" verify="$4" expected="$5"
  local actual
  $PSQL -c "SET request.jwt.claim.sub = '$uid'; SET ROLE authenticated; $mutation" >/dev/null 2>&1
  actual=$($PSQL -tA -c "$verify" 2>&1 | tr -d '[:space:]')
  if [ "$actual" = "$expected" ]; then pass "$label"; else fail "$label (row changed: got '$actual', expected '$expected')"; fi
}

CLIENT=00000000-0000-0000-0000-0000000000c1
STRANGER=00000000-0000-0000-0000-0000000000c2
LAWYER=00000000-0000-0000-0000-0000000000b1
LAWYER2=00000000-0000-0000-0000-0000000000b2
ADMIN=00000000-0000-0000-0000-0000000000a1
M_CLIENT=00000000-0000-0000-0000-0000000000e1
M_OTHER=00000000-0000-0000-0000-0000000000e2

try_as "client can post a client-visible note on their own matter" "$CLIENT" allow \
  "INSERT INTO public.matter_notes (matter_id, author_id, body, visibility) VALUES ('$M_CLIENT','$CLIENT','Hello, I have a question.',  'client');"

try_as "client CANNOT post on a matter that is not theirs" "$STRANGER" deny \
  "INSERT INTO public.matter_notes (matter_id, author_id, body, visibility) VALUES ('$M_CLIENT','$STRANGER','Not my matter.', 'client');"

try_as "client CANNOT post an internal note on their own matter" "$CLIENT" deny \
  "INSERT INTO public.matter_notes (matter_id, author_id, body, visibility) VALUES ('$M_CLIENT','$CLIENT','Sneaky internal.', 'internal');"

try_as "client CANNOT forge another author" "$CLIENT" deny \
  "INSERT INTO public.matter_notes (matter_id, author_id, body, visibility) VALUES ('$M_CLIENT','$LAWYER','Forged author.', 'client');"

try_as "assigned lawyer can still post an internal note" "$LAWYER" allow \
  "INSERT INTO public.matter_notes (matter_id, author_id, body, visibility) VALUES ('$M_CLIENT','$LAWYER','Privileged strategy.', 'internal');"

try_as "admin can still post a client-visible note" "$ADMIN" allow \
  "INSERT INTO public.matter_notes (matter_id, author_id, body, visibility) VALUES ('$M_CLIENT','$ADMIN','Firm update for you.', 'client');"

# Notifications: the client's message must reach the lawyers, not bounce back.
NOTIF=$($PSQL -tA -c "
  SELECT count(*) FROM public.notifications
  WHERE title = 'New message from your client'
    AND user_id = '$LAWYER';" 2>&1)
if [ "$NOTIF" = "1" ]; then pass "client's message notifies the assigned lawyer"; else fail "client's message notifies the assigned lawyer (got '$NOTIF')"; fi

NOTIF=$($PSQL -tA -c "
  SELECT count(*) FROM public.notifications
  WHERE title = 'New message from a client'
    AND user_id = '$LAWYER2';" 2>&1)
if [ "$NOTIF" = "1" ]; then pass "client's message notifies the rest of the matter team"; else fail "client's message notifies the rest of the matter team (got '$NOTIF')"; fi

# Scope to the client's own body, not the title. The admin's note legitimately
# notifies the client, so a title match would flag that as a failure.
NOTIF=$($PSQL -tA -c "
  SELECT count(*) FROM public.notifications
  WHERE user_id = '$CLIENT' AND message LIKE 'Hello, I have a question.%';" 2>&1)
if [ "$NOTIF" = "0" ]; then pass "client is NOT notified about their own message"; else fail "client is NOT notified about their own message (got '$NOTIF')"; fi

# Derive the expected counts rather than hardcoding them, so adding a fixture
# note cannot silently invalidate the assertion.
TOTAL=$($PSQL -tA -c "SELECT count(*) FROM public.matter_notes WHERE matter_id = '$M_CLIENT';")
INTERNAL=$($PSQL -tA -c "SELECT count(*) FROM public.matter_notes WHERE matter_id = '$M_CLIENT' AND visibility = 'internal';")
CLIENT_VISIBLE=$((TOTAL - INTERNAL))
echo "        ($TOTAL notes on the matter: $CLIENT_VISIBLE client-visible, $INTERNAL internal)"

vis_as() {
  local role="$1" uid="$2" expect="$3" label="$4"
  local got
  got=$($PSQL -tA -c "SET request.jwt.claim.sub = '$uid'; SET ROLE authenticated;
    SELECT count(*) FROM public.matter_notes WHERE matter_id = '$M_CLIENT';" 2>&1 | tail -1)
  if [ "$got" = "$expect" ]; then pass "$label ($got)"; else fail "$label (got '$got', expected '$expect')"; fi
}

vis_as client  "$CLIENT"  "$CLIENT_VISIBLE" "client sees only the client-visible notes"
vis_as admin   "$ADMIN"   "$CLIENT_VISIBLE" "admin never sees internal notes"
vis_as lawyer  "$LAWYER"  "$TOTAL"          "lawyer sees every note including internal"
vis_as lawyer2 "$LAWYER2" "$TOTAL"          "added team member sees every note too"

# Revoking EXECUTE on a trigger function is only safe because PostgreSQL checks
# the privilege when the trigger is CREATED, not each time it fires. If that is
# wrong, audit logging silently stops — so prove it fires.
AUDIT=$($PSQL -tA -c "SELECT count(*) FROM public.audit_logs WHERE event_type = 'ACCOUNT_CREATED';" 2>&1 | tr -d '[:space:]')
if [ "${AUDIT:-0}" -gt 0 ] 2>/dev/null; then
  pass "log_auth_event still fires after its EXECUTE grant was revoked ($AUDIT rows)"
else
  fail "log_auth_event still fires after its EXECUTE grant was revoked (got '$AUDIT')"
fi

# can_exec <label> <role> <uid-or-empty> <expect: allow|deny> <function-call>
#
# Function calls DO raise on a refused EXECUTE, unlike UPDATE/DELETE, so exit
# status is a reliable signal here.
can_exec() {
  local label="$1" role="$2" uid="$3" expect="$4" call="$5"
  local out rc
  if [ -n "$uid" ]; then
    out=$($PSQL -c "SET request.jwt.claim.sub = '$uid'; SET ROLE $role; SELECT $call;" 2>&1)
  else
    out=$($PSQL -c "SET ROLE $role; SELECT $call;" 2>&1)
  fi
  rc=$?
  if [ "$expect" = "allow" ]; then
    if [ $rc -eq 0 ]; then pass "$label"; else fail "$label (should be allowed)"; echo "        $(echo "$out" | grep -i error | head -1)"; fi
  else
    if [ $rc -ne 0 ]; then pass "$label"; else fail "$label (should have been denied)"; fi
  fi
}

can_exec "anon CANNOT deactivate an account"            anon          ""       deny  "public.soft_delete_profile('$CLIENT')"
can_exec "a signed-in client CANNOT deactivate anyone"  authenticated "$CLIENT" deny  "public.soft_delete_profile('$ADMIN')"
can_exec "anon CANNOT reactivate an account"            anon          ""       deny  "public.reactivate_profile('$CLIENT')"
can_exec "an admin CAN still deactivate an account"     authenticated "$ADMIN"  allow "public.soft_delete_profile('$STRANGER')"

# Put the stranger back so later assertions are not affected.
$PSQL -q -c "SELECT public.reactivate_profile('$STRANGER');" >/dev/null 2>&1

# ── Admin profile writes: the adminChangeUserRole / adminDeactivateUser path ──
# src/lib/services/admin.ts changes a role or a status with a plain
# UPDATE ... RETURNING on another user's profile, not through an RPC. That path
# had no assertion, and UPDATE/DELETE are silent when a policy blocks them, so
# every check here asserts on the row afterwards rather than on exit status.
$PSQL -c "SET request.jwt.claim.sub = '$ADMIN'; SET ROLE authenticated;
  UPDATE public.profiles SET role = 'lawyer', updated_at = NOW() WHERE id = '$STRANGER';" >/dev/null 2>&1
GOT=$($PSQL -tA -c "SELECT role FROM public.profiles WHERE id = '$STRANGER';" | tr -d '[:space:]')
if [ "$GOT" = "lawyer" ]; then pass "admin CAN change another user's role"; else fail "admin CAN change another user's role (role is '$GOT')"; fi

deny_mutation "a client CANNOT change anyone's role" "$CLIENT" \
  "UPDATE public.profiles SET role = 'admin' WHERE id = '$STRANGER';" \
  "SELECT role FROM public.profiles WHERE id = '$STRANGER';" "lawyer"

deny_mutation "the last active admin CANNOT be demoted" "$ADMIN" \
  "UPDATE public.profiles SET role = 'lawyer' WHERE id = '$ADMIN';" \
  "SELECT role FROM public.profiles WHERE id = '$ADMIN';" "admin"

$PSQL -c "SET request.jwt.claim.sub = '$ADMIN'; SET ROLE authenticated;
  UPDATE public.profiles SET is_active = FALSE, updated_at = NOW() WHERE id = '$STRANGER';" >/dev/null 2>&1
GOT=$($PSQL -tA -c "SELECT is_active FROM public.profiles WHERE id = '$STRANGER';" | tr -d '[:space:]')
if [ "$GOT" = "f" ]; then pass "admin CAN deactivate another account (direct UPDATE)"; else fail "admin CAN deactivate another account (is_active is '$GOT')"; fi

# Restore the stranger as superuser so the later assertions see the fixture again.
$PSQL -q -c "UPDATE public.profiles SET role = 'client', is_active = TRUE WHERE id = '$STRANGER';" >/dev/null 2>&1

# The contact form is anonymous, so its insert must still work — with the
# columns the form actually sends.
try_as "a visitor can still submit a normal inquiry" "" allow \
  "INSERT INTO public.inquiries (name, email, message, subject, practice_area, status) VALUES ('Walk In','walkin@example.com','I need help.','General','labor','New');" anon

# But not one that forges the internal columns the form never sends.
try_as "a visitor CANNOT pre-assign an inquiry to a lawyer" "" deny \
  "INSERT INTO public.inquiries (name, email, message, subject, practice_area, status, assigned_to) VALUES ('Forged','forged@example.com','x','General','labor','New','$LAWYER');" anon

try_as "a visitor CANNOT file an inquiry into someone else's portal" "" deny \
  "INSERT INTO public.inquiries (name, email, message, subject, practice_area, status, client_id) VALUES ('Forged','forged@example.com','x','General','labor','New','$CLIENT');" anon

# The public forms all go through public.submit_inquiry() (20261006). Prove the
# anonymous path end to end, because that is the one that was broken on the
# live project: a direct insert died on `permission denied for sequence
# inquiry_number_seq`, and even with the grant fixed the visitor could not read
# the row back to learn their reference number.
REF=$($PSQL -tA -c "SET ROLE anon;
  SELECT public.submit_inquiry('Walk In','walkin@example.com','+63 900 000 0000','labor','Email',
    'I need help with a labor matter.','General inquiry');" 2>&1 | tail -1 | tr -d '[:space:]')
if echo "$REF" | grep -qE '^WI-[0-9]{4}-[0-9]{3}$'; then
  pass "an anonymous visitor can submit an inquiry and gets a reference ($REF)"
else
  fail "an anonymous visitor cannot submit an inquiry via submit_inquiry() (got '$REF')"
fi

# ...and the row it created must be filed correctly: New, unassigned, and
# owned by nobody, because an anonymous caller has no identity to file it under.
FILED=$($PSQL -tA -c "
  SELECT status::text || '|' || COALESCE(client_id::text,'-') || '|' || COALESCE(assigned_to::text,'-')
  FROM public.inquiries WHERE inquiry_number = '$REF';" 2>&1 | tr -d '[:space:]')
if [ "$FILED" = "New|-|-" ]; then
  pass "the inquiry lands in the queue as New and unassigned"
else
  fail "the inquiry was filed wrong (got '$FILED', expected 'New|-|-')"
fi

# A signed-in client submitting the same form is filed under their own account,
# taken from the JWT rather than from anything the browser sent.
REF2=$($PSQL -tA -c "SET request.jwt.claim.sub = '$CLIENT'; SET ROLE authenticated;
  SELECT public.submit_inquiry('Cora Client','cora@wlf.test',NULL,'labor','Email',
    'Following up on my matter.','General inquiry');" 2>&1 | tail -1 | tr -d '[:space:]')
FILED2=$($PSQL -tA -c "
  SELECT status::text || '|' || COALESCE(client_id::text,'-')
  FROM public.inquiries WHERE inquiry_number = '$REF2';" 2>&1 | tr -d '[:space:]')
if [ "$FILED2" = "New|$CLIENT" ]; then
  pass "a signed-in client's inquiry is filed under their own account"
else
  fail "a signed-in client's inquiry was filed wrong (got '$FILED2')"
fi

# The function validates server-side, so the browser's checks are not load-bearing.
# Match on the message, not the SQLSTATE — psql does not print the code.
reject_check() {
  local label="$1" call="$2" expect="$3"
  local out
  out=$($PSQL -c "SET ROLE anon; $call" 2>&1)
  if echo "$out" | grep -qF "$expect"; then
    pass "submit_inquiry rejects $label"
  else
    fail "submit_inquiry accepted $label (expected '$expect')"
    echo "        $(echo "$out" | grep -i error | head -1)"
  fi
}

reject_check "a blank name" \
  "SELECT public.submit_inquiry('', 'a@b.co', NULL, NULL, NULL, 'hi', NULL);" \
  "Please enter your name"
reject_check "a malformed email" \
  "SELECT public.submit_inquiry('A', 'not-an-email', NULL, NULL, NULL, 'hi', NULL);" \
  "Please enter a valid email address"
reject_check "a whitespace-only message" \
  "SELECT public.submit_inquiry('A', 'a@b.co', NULL, NULL, NULL, '   ', NULL);" \
  "Please tell us how we can help"

# The four tables 20261001 creates, plus the anonymous inquiry path, depend on
# grants that Supabase normally supplies via ALTER DEFAULT PRIVILEGES. This
# harness sets that default up too, so it CANNOT detect a gap here the way the
# live project could — 20261005 section 11 makes them explicit for that reason.
# Assert the end state regardless.
grants_ok() {
  local label="$1" sql="$2" expect="$3"
  local got
  got=$($PSQL -tA -c "$sql" 2>&1 | tr -d '[:space:]')
  if [ "$got" = "$expect" ]; then pass "$label"; else fail "$label (got '$got', expected '$expect')"; fi
}

grants_ok "authenticated can read and write the four 20261001 tables" \
  "SELECT bool_and(has_table_privilege('authenticated', c.oid, 'SELECT')
                AND has_table_privilege('authenticated', c.oid, 'INSERT')
                AND has_table_privilege('authenticated', c.oid, 'UPDATE')
                AND has_table_privilege('authenticated', c.oid, 'DELETE'))
   FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public'
     AND c.relname IN ('matter_members','matter_notes','matter_events','confidential_access_grants');" \
  "t"

grants_ok "anon is denied on those four tables" \
  "SELECT bool_and(NOT has_table_privilege('anon', c.oid, 'SELECT'))
   FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public'
     AND c.relname IN ('matter_members','matter_notes','matter_events','confidential_access_grants');" \
  "t"

# Same blind spot as the four tables, one level up: every policy on matters,
# documents and the three matter tables calls a private.* helper, and resolving
# that call needs USAGE on the schema. PostgreSQL gives a new schema to its
# owner only, so a database built from migrations alone would 403 everywhere
# unless 20261005 section 11c grants it. schema-production.sql also grants it,
# which is why this harness cannot tell the two apart — assert the end state.
grants_ok "authenticated can use the private schema and anon cannot" \
  "SELECT has_schema_privilege('authenticated', 'private', 'USAGE')
      AND NOT has_schema_privilege('anon', 'private', 'USAGE');" \
  "t"

grants_ok "the anonymous contact form can reach its number generator" \
  "SELECT has_function_privilege('anon', 'public.generate_inquiry_number()', 'EXECUTE')
      AND has_sequence_privilege('anon', 'public.inquiry_number_seq', 'USAGE');" \
  "t"

# The diagnostic handed to the owner has to run, or it wastes a round trip.
# More importantly it has to survive objects being ABSENT — the whole reason it
# exists is to report what the live database is missing, and the first version
# died with 42883 on the very function it was supposed to report.
if $PSQL -f "$REPO/supabase/tests/diagnose-console-errors.sql" > "$WORKDIR/diag.out" 2>"$WORKDIR/diag.err"; then
  pass "supabase/tests/diagnose-console-errors.sql runs cleanly"
else
  fail "supabase/tests/diagnose-console-errors.sql failed"
  grep -i error "$WORKDIR/diag.err" | head -5
fi

# The live project is missing 20260929 entirely, which is why uploads fail: the
# policy it leaves behind is the schema-production one that demands the
# documents row already exist. The app uploads the file FIRST. Assert the
# upload-first policy is the one in force.
grants_ok "the storage upload policy accepts a file before its documents row" \
  "SELECT EXISTS (SELECT 1 FROM pg_policies
                  WHERE schemaname = 'storage' AND tablename = 'objects'
                    AND policyname = 'documents_storage_insert'
                    AND qual IS NULL
                    AND with_check LIKE '%user_can_access_matter_path%');" \
  "t"

echo
echo "== 6b. Admins are view-only on documents =="
# 20261012. The table policy still carries the access-level rule; the storage
# policy cannot see the level (the file is uploaded before its row exists), so
# it refuses admins by role. Both layers are asserted, plus the two roles that
# must keep working.
try_as "admin CANNOT upload a document" "$ADMIN" deny \
  "INSERT INTO public.documents (matter_id, name, file_path, file_type, file_size, access_level, uploaded_by)
   VALUES ('$M_CLIENT','admin-check.pdf','$M_CLIENT/admin-check.pdf','application/pdf',1024,'Client & Assigned Lawyer','$ADMIN');"

try_as "the assigned lawyer can still upload a Confidential document" "$LAWYER" allow \
  "INSERT INTO public.documents (matter_id, name, file_path, file_type, file_size, access_level, uploaded_by)
   VALUES ('$M_CLIENT','lawyer-check.pdf','$M_CLIENT/lawyer-check.pdf','application/pdf',1024,'Confidential','$LAWYER');"

try_as "the client can still upload to their own matter" "$CLIENT" allow \
  "INSERT INTO public.documents (matter_id, name, file_path, file_type, file_size, access_level, uploaded_by)
   VALUES ('$M_CLIENT','client-check.pdf','$M_CLIENT/client-check.pdf','application/pdf',1024,'Client & Assigned Lawyer','$CLIENT');"

grants_ok "the storage upload policy refuses admins by role" \
  "SELECT EXISTS (SELECT 1 FROM pg_policies
                  WHERE schemaname = 'storage' AND tablename = 'objects'
                    AND policyname = 'documents_storage_insert'
                    AND with_check LIKE '%is_admin%');" \
  "t"

grants_ok "the storage delete policy no longer lets admins delete any file" \
  "SELECT NOT EXISTS (SELECT 1 FROM pg_policies
                      WHERE schemaname = 'storage' AND tablename = 'objects'
                        AND policyname = 'documents_storage_delete'
                        AND qual LIKE '%is_admin%');" \
  "t"

echo
echo "== 6c. Seminar registrations =="
# 20261013. A registration was already an inquiries row with the subject
# 'Seminar registration', but the seminar itself lived only in the message
# body, so the admin screen could not group them. The link column and the RPC
# parameter fix that; the send log backs "email every registrant".
grants_ok "inquiries.seminar_id exists and is indexed" \
  "SELECT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = 'inquiries'
                    AND column_name = 'seminar_id')
      AND to_regclass('public.inquiries_seminar_id_idx') IS NOT NULL;" \
  "t"

# Keeping BOTH signatures would make a 7-argument call ambiguous — every
# argument has a default — and PostgREST answers ambiguity with PGRST203, so
# the live contact form would break the moment the old signature stayed behind.
grants_ok "only the 8-arg submit_inquiry survives, and anon can still call it" \
  "SELECT to_regprocedure('public.submit_inquiry(text,text,text,text,text,text,text)') IS NULL
      AND to_regprocedure('public.submit_inquiry(text,text,text,text,text,text,text,text)') IS NOT NULL
      AND has_function_privilege('anon', 'public.submit_inquiry(text,text,text,text,text,text,text,text)', 'EXECUTE');" \
  "t"

# The frontend deployed today still calls the 7-argument form. It has to keep
# working through the new default until the new build is live.
REF=$($PSQL -tA -c "SET ROLE anon;
  SELECT public.submit_inquiry('Old Form','old@example.com',NULL,'labor',NULL,'Seven-arg call.','General inquiry');" 2>&1 | tail -1 | tr -d '[:space:]')
if echo "$REF" | grep -qE '^WI-[0-9]{4}-[0-9]{3}$'; then
  pass "the deployed 7-argument call still works ($REF)"
else
  fail "the deployed 7-argument call broke (got '$REF')"
fi

REF=$($PSQL -tA -c "SET ROLE anon;
  SELECT public.submit_inquiry('Seminar Guest','guest@example.com',NULL,NULL,NULL,'Please register me.','Seminar registration','e1');" 2>&1 | tail -1 | tr -d '[:space:]')
LINKED=$($PSQL -tA -c "SELECT COALESCE(seminar_id,'-') FROM public.inquiries WHERE inquiry_number = '$REF';" 2>&1 | tr -d '[:space:]')
if [ "$LINKED" = "e1" ]; then
  pass "a registration records which seminar it is for"
else
  fail "a registration was not linked to its seminar (got '$LINKED')"
fi

# A delisted seminar is refused with the message the browser shows, not a raw
# FK error. The id is validated inside the function for exactly this case.
BAD=$($PSQL -c "SET ROLE anon;
  SELECT public.submit_inquiry('Seminar Guest','guest@example.com',NULL,NULL,NULL,'x','Seminar registration','no-such-seminar');" 2>&1)
if echo "$BAD" | grep -qF 'no longer listed'; then
  pass "a registration for a delisted seminar is refused"
else
  fail "a registration for a delisted seminar was not refused"
  echo "        $(echo "$BAD" | grep -i error | head -1)"
fi

# A legacy registration (seminar only in the message text) must be linked by
# the backfill when the migration re-runs, and the re-run proves the file is
# idempotent on its own. The message shape is copied from
# SeminarRegistrationModal.tsx; e2 is the Corporate Compliance forum.
# practice_area is NOT NULL on inquiries — omit it and the insert dies without
# a word, which is how this assertion failed the first time it ran.
$PSQL -q -c "INSERT INTO public.inquiries (name, email, message, subject, practice_area, status)
             VALUES ('Legacy Guest','legacy@example.com',
                     E'I would like to register for the following seminar:\n\nSeminar: Corporate Compliance and Business Law Forum',
                     'Seminar registration','', 'New');" >/dev/null 2>"$WORKDIR/legacy.err"
FIXROWS=$($PSQL -tA -c "SELECT count(*) FROM public.inquiries WHERE email = 'legacy@example.com';" 2>&1 | tr -d '[:space:]')
if [ "$FIXROWS" != "1" ]; then
  fail "harness: could not insert the legacy registration fixture (got '$FIXROWS' rows)"
  grep -i error "$WORKDIR/legacy.err" | head -3
elif $PSQL -f "$REPO/supabase/migrations/20261013_seminar_registrations.sql" >/dev/null 2>"$WORKDIR/sem.err"; then
  BACK=$($PSQL -tA -c "SELECT COALESCE(seminar_id,'-') FROM public.inquiries
                       WHERE email = 'legacy@example.com' AND subject = 'Seminar registration';" 2>&1 | tr -d '[:space:]')
  if [ "$BACK" = "e2" ]; then
    pass "the backfill links a legacy registration from its message text"
  else
    fail "the backfill left the legacy registration unlinked (got '$BACK')"
  fi
else
  fail "20261013 could not be re-applied on its own"
  grep -i error "$WORKDIR/sem.err" | head -3
fi

# The send log: granted to nobody but the service role, and RLS-gated on top.
# The fixture row is inserted as superuser so the read checks cannot pass by
# counting zero rows.
grants_ok "seminar_email_log is RLS-gated and writable by nobody but service_role" \
  "SELECT to_regclass('public.seminar_email_log') IS NOT NULL
      AND (SELECT relrowsecurity FROM pg_class WHERE oid = to_regclass('public.seminar_email_log'))
      AND NOT has_table_privilege('anon', 'public.seminar_email_log', 'SELECT')
      AND NOT has_table_privilege('authenticated', 'public.seminar_email_log', 'INSERT')
      AND has_table_privilege('service_role', 'public.seminar_email_log', 'INSERT')
      AND EXISTS (SELECT 1 FROM pg_policies
                  WHERE schemaname = 'public' AND tablename = 'seminar_email_log'
                    AND policyname = 'seminar_email_log_select_admin');" \
  "t"

$PSQL -q -c "INSERT INTO public.seminar_email_log (seminar_id, sent_by, subject, recipient_count, sent_count, failed_count)
             VALUES ('e1','$ADMIN','Fixture subject',2,2,0);" >/dev/null 2>&1
GOT=$($PSQL -tA -c "SET request.jwt.claim.sub = '$CLIENT'; SET ROLE authenticated;
  SELECT count(*) FROM public.seminar_email_log;" 2>&1 | tail -1 | tr -d '[:space:]')
if [ "$GOT" = "0" ]; then pass "a client reads no send-log rows"; else fail "a client can read the send log (got '$GOT')"; fi
GOT=$($PSQL -tA -c "SET request.jwt.claim.sub = '$ADMIN'; SET ROLE authenticated;
  SELECT count(*) FROM public.seminar_email_log;" 2>&1 | tail -1 | tr -d '[:space:]')
if [ "$GOT" = "1" ]; then pass "an admin reads the send log"; else fail "an admin cannot read the send log (got '$GOT')"; fi

echo
echo "== 6d. Audit log writes from the browser =="
# 20261014. The live project answered every signed-in action with
#   POST /rest/v1/audit_logs?select=*  ->  403
# because the ad-hoc base schema enables RLS on audit_logs with SELECT-only
# policies, and the two files that add the INSERT path (20260916_create_audit_
# logs_table, 20260918_fix_all_rls_policies) are not part of the apply chain.
#
# The harness cannot see that gap directly — it applies the whole chain, so
# 20260916/20260918 are present here. Reproduce the live state by hand instead:
# drop the policies, revoke the grants, re-apply 20261014 ALONE, and require
# the browser's exact statement shape to work. This is the same technique
# 20261007 used for the content-table grants.
$PSQL -q >/dev/null 2>&1 <<'SQL'
DROP POLICY IF EXISTS audit_logs_insert_policy ON public.audit_logs;
DROP POLICY IF EXISTS audit_logs_select_policy ON public.audit_logs;
DROP POLICY IF EXISTS audit_logs_select_admin_policy ON public.audit_logs;
REVOKE INSERT, SELECT ON public.audit_logs FROM authenticated;
SQL

if $PSQL -f "$REPO/supabase/migrations/20261014_audit_log_browser_writes.sql" >/dev/null 2>"$WORKDIR/audit.err"; then
  pass "20261014 re-applies on its own over the live-shaped gap"
else
  fail "20261014 could not be re-applied"
  grep -i error "$WORKDIR/audit.err" | head -3
fi

# src/lib/services/audit.ts writes with .insert(...).select().single(), i.e.
# PostgREST runs INSERT ... RETURNING. RETURNING needs SELECT privilege AND a
# SELECT policy that can see the new row, so restoring the INSERT grant alone
# would still 403. Assert the whole shape, not just the insert.
out=$($PSQL -c "SET request.jwt.claim.sub = '$CLIENT'; SET ROLE authenticated;
  INSERT INTO public.audit_logs (user_id, user_email, event_type, event_description, success)
  VALUES ('$CLIENT', 'client@wlf.test', 'LOGIN', 'harness browser-path insert', TRUE)
  RETURNING id;" 2>&1)
if [ $? -eq 0 ] && echo "$out" | grep -qE '[0-9a-f]{8}-[0-9a-f]{4}'; then
  pass "the browser audit insert (INSERT ... RETURNING) works as authenticated"
else
  fail "the browser audit insert is still denied"
  echo "        $(echo "$out" | grep -i error | head -1)"
fi

# The WITH CHECK must refuse a row attributed to somebody else.
try_as "a client CANNOT write an audit row attributed to another user" "$CLIENT" deny \
  "INSERT INTO public.audit_logs (user_id, event_type, event_description, success) VALUES ('$ADMIN','LOGIN','forged',TRUE);"

# The admin-read policy must let an admin see the whole trail, and the
# own-rows policy must still stop a client reading anyone else's.
GOT=$($PSQL -tA -c "SET request.jwt.claim.sub = '$ADMIN'; SET ROLE authenticated;
  SELECT count(*) FROM public.audit_logs WHERE user_id = '$CLIENT';" 2>&1 | tail -1 | tr -d '[:space:]')
if [ "$GOT" -ge 1 ] 2>/dev/null; then
  pass "an admin can read another user's audit rows"
else
  fail "an admin cannot read another user's audit rows (got '$GOT')"
fi

GOT=$($PSQL -tA -c "SET request.jwt.claim.sub = '$STRANGER'; SET ROLE authenticated;
  SELECT count(*) FROM public.audit_logs WHERE user_id = '$CLIENT';" 2>&1 | tail -1 | tr -d '[:space:]')
if [ "$GOT" = "0" ]; then
  pass "a client cannot read somebody else's audit rows"
else
  fail "a client can read somebody else's audit rows (got '$GOT')"
fi

grants_ok "audit_logs is append-only for authenticated and closed to anon" \
  "SELECT has_table_privilege('authenticated', 'public.audit_logs', 'INSERT')
      AND has_table_privilege('authenticated', 'public.audit_logs', 'SELECT')
      AND NOT has_table_privilege('authenticated', 'public.audit_logs', 'UPDATE')
      AND NOT has_table_privilege('authenticated', 'public.audit_logs', 'DELETE')
      AND NOT has_table_privilege('anon', 'public.audit_logs', 'SELECT')
      AND NOT has_table_privilege('anon', 'public.audit_logs', 'INSERT');" \
  "t"

echo
echo "== 6e. Matter messages are encrypted at rest =="
# 20261015. body is stored as base64 ciphertext; the only plain-text copy of a
# message is the 140-char preview the notification trigger writes (asserted in
# section 6 already). The read view must decrypt for an authorized caller and
# expose nothing to a non-member, and the key must be unreachable.
PLAIN=$($PSQL -tA -c "SELECT count(*) FROM public.matter_notes
                      WHERE matter_id = '$M_CLIENT'
                        AND body = 'Hello, I have a question.';" 2>&1 | tr -d '[:space:]')
if [ "$PLAIN" = "0" ]; then
  pass "no matter message is stored as plain text"
else
  fail "a matter message is still stored as plain text (got '$PLAIN')"
fi

ENC=$($PSQL -tA -c "SELECT count(*) FROM public.matter_notes
                    WHERE matter_id = '$M_CLIENT' AND body_encrypted;" 2>&1 | tr -d '[:space:]')
ALL=$($PSQL -tA -c "SELECT count(*) FROM public.matter_notes WHERE matter_id = '$M_CLIENT';" 2>&1 | tr -d '[:space:]')
if [ "$ENC" = "$ALL" ] && [ "$ALL" != "0" ]; then
  pass "every note on the matter is marked encrypted ($ENC/$ALL)"
else
  fail "not every note is marked encrypted (got $ENC/$ALL)"
fi

DEC=$($PSQL -tA -c "SET request.jwt.claim.sub = '$LAWYER'; SET ROLE authenticated;
  SELECT count(*) FROM public.matter_notes_thread
  WHERE matter_id = '$M_CLIENT' AND body = 'Hello, I have a question.';" 2>&1 | tail -1 | tr -d '[:space:]')
if [ "$DEC" = "1" ]; then
  pass "the read view decrypts the message for the assigned lawyer"
else
  fail "the read view did not decrypt the message (got '$DEC')"
fi

GOT=$($PSQL -tA -c "SET request.jwt.claim.sub = '$CLIENT'; SET ROLE authenticated;
  SELECT count(*) FROM public.matter_notes_thread
  WHERE matter_id = '$M_CLIENT' AND body = 'Hello, I have a question.';" 2>&1 | tail -1 | tr -d '[:space:]')
if [ "$GOT" = "1" ]; then
  pass "the client reads their own message decrypted"
else
  fail "the client cannot read their own message (got '$GOT')"
fi

GOT=$($PSQL -tA -c "SET request.jwt.claim.sub = '$STRANGER'; SET ROLE authenticated;
  SELECT count(*) FROM public.matter_notes_thread WHERE matter_id = '$M_CLIENT';" 2>&1 | tail -1 | tr -d '[:space:]')
if [ "$GOT" = "0" ]; then
  pass "a stranger sees no rows through the read view"
else
  fail "a stranger sees rows through the read view (got '$GOT')"
fi

grants_ok "authenticated can decrypt, but cannot read the key" \
  "SELECT has_function_privilege('authenticated', 'private.decrypt_matter_note(text)', 'EXECUTE')
      AND NOT has_function_privilege('authenticated', 'private.matter_note_key()', 'EXECUTE');" \
  "t"

can_exec "a client CANNOT read the matter-notes key" authenticated "$CLIENT" deny "private.matter_note_key()"

# Idempotency: re-applying the migration must NOT double-encrypt. The backfill
# only touches rows with body_encrypted = false, so the stored message has to
# still decrypt to its original text afterwards.
if $PSQL -f "$REPO/supabase/migrations/20261015_matter_notes_encryption.sql" \
     >/dev/null 2>"$WORKDIR/enc.err"; then
  DEC2=$($PSQL -tA -c "SET request.jwt.claim.sub = '$CLIENT'; SET ROLE authenticated;
    SELECT count(*) FROM public.matter_notes_thread
    WHERE matter_id = '$M_CLIENT' AND body = 'Hello, I have a question.';" 2>&1 | tail -1 | tr -d '[:space:]')
  if [ "$DEC2" = "1" ]; then
    pass "re-applying 20261015 does not double-encrypt the stored message"
  else
    fail "re-applying 20261015 broke the stored message (got '$DEC2')"
  fi
else
  fail "20261015 could not be re-applied on its own"
  grep -i error "$WORKDIR/enc.err" | head -3
fi

echo
echo "== 6f. Admins are notified about client inquiries =="
# 20261017. A signed-in client's inquiry is never emailed (notify-inquiry only
# claims client_id IS NULL), so the bell notification is the firm's only signal.
# File one as the client and require a notification for the admin; then file a
# signed-out visitor's inquiry and require NO notification (it is emailed
# instead and never enters Client Intake).
$PSQL -q >/dev/null 2>&1 <<SQL
SET request.jwt.claim.sub = '$CLIENT'; SET ROLE authenticated;
INSERT INTO public.inquiries (inquiry_number, name, email, practice_area, subject, message, status, client_id)
VALUES ('WI-2099-901', 'Cora Client', 'client@wlf.test', 'labor', 'I need legal advice',
        'Harness inquiry from a registered client.', 'New', '$CLIENT');
SQL

NOTIF=$($PSQL -tA -c "SELECT count(*) FROM public.notifications
  WHERE user_id = '$ADMIN' AND link = 'intake' AND message LIKE '%WI-2099-901%';" 2>&1 | tr -d '[:space:]')
if [ "$NOTIF" = "1" ]; then
  pass "a registered client's inquiry notifies the admin"
else
  fail "a registered client's inquiry notifies the admin (got '$NOTIF')"
fi

$PSQL -q >/dev/null 2>&1 <<SQL
INSERT INTO public.inquiries (inquiry_number, name, email, practice_area, subject, message, status, client_id)
VALUES ('WI-2099-902', 'Vic Visitor', 'visitor@example.com', 'labor', 'General inquiry',
        'Harness inquiry from a signed-out visitor.', 'New', NULL);
SQL

NOTIF=$($PSQL -tA -c "SELECT count(*) FROM public.notifications
  WHERE user_id = '$ADMIN' AND message LIKE '%WI-2099-902%';" 2>&1 | tr -d '[:space:]')
if [ "$NOTIF" = "0" ]; then
  pass "a signed-out visitor's inquiry does NOT notify the admin"
else
  fail "a signed-out visitor's inquiry does NOT notify the admin (got '$NOTIF')"
fi

echo
echo "== 7. Content payloads match the real columns =="
# Runs the admin ContentManager's own draft -> payload path against the real
# tables. A wrong column name (the form once wrote speaker_name while the
# public page reads speaker) fails here instead of in production.
if ! (cd "$REPO" && npx tsx scripts/content-payload-check.ts > "$WORKDIR/content.sql" 2>"$WORKDIR/content.err"); then
  echo "  FAIL  payload check refused to generate SQL"
  cat "$WORKDIR/content.err"
  FAILURES=$((FAILURES + 1))
else
  # As admin, which is who uses this screen.
  out=$($PSQL -c "SET request.jwt.claim.sub = '$ADMIN'; SET ROLE authenticated; $(cat "$WORKDIR/content.sql")" 2>&1)
  if [ $? -ne 0 ]; then
    fail "admin content CRUD failed"
    echo "$out" | grep -i error | head -5
  else
    # The generated SQL ends with a count of anything it failed to clean up.
    leftover=$($PSQL -tA -c "
      SELECT (SELECT count(*) FROM public.articles          WHERE id       = 'payload-check-article')
           + (SELECT count(*) FROM public.faqs              WHERE question = 'Payload check question?')
           + (SELECT count(*) FROM public.seminar_events    WHERE id       = 'payload-check-seminar')
           + (SELECT count(*) FROM public.retainer_packages WHERE id       = 'payload-check-retainer')
           + (SELECT count(*) FROM public.practice_areas    WHERE id       = 'payload-check-area');" 2>&1 | tr -d '[:space:]')
    if [ "$leftover" = "0" ]; then
      pass "admin can create, publish, unpublish and delete all five content types"
    else
      fail "content rows were left behind (leftover=$leftover)"
    fi
  fi

  # And the same writes must be refused for everyone else. The fixture is
  # created here rather than borrowed from the seed so the test cannot pass by
  # matching zero rows.
  $PSQL -q -c "INSERT INTO public.practice_areas (id, name, slug, description, icon, color)
               VALUES ('deny-test-area','Deny Test','deny-test-area','x','x','x')
               ON CONFLICT (id) DO NOTHING;" >/dev/null 2>&1

  try_as "client CANNOT create an article" "$CLIENT" deny \
    "INSERT INTO public.articles (id, title, slug, excerpt, content, category) VALUES ('sneaky','Sneaky','sneaky','x','x','x');"

  deny_mutation "lawyer CANNOT delete a practice area" "$LAWYER" \
    "DELETE FROM public.practice_areas WHERE id = 'deny-test-area';" \
    "SELECT count(*) FROM public.practice_areas WHERE id = 'deny-test-area';" "1"
  deny_mutation "lawyer CANNOT rewrite a practice area" "$LAWYER" \
    "UPDATE public.practice_areas SET name = 'Hijacked' WHERE id = 'deny-test-area';" \
    "SELECT name FROM public.practice_areas WHERE id = 'deny-test-area';" "DenyTest"
  deny_mutation "client CANNOT rewrite a matter's status" "$CLIENT" \
    "UPDATE public.matters SET status = 'Closed' WHERE id = '$M_CLIENT';" \
    "SELECT status FROM public.matters WHERE id = '$M_CLIENT';" "Active"

  try_as "admin CAN delete a practice area" "$ADMIN" allow \
    "DELETE FROM public.practice_areas WHERE id = 'deny-test-area';"
fi

# ── 7b. The content grants cannot depend on project defaults ────────────────
# This is the live bug of 2026-09-30: on labwmffshjaywmattmen an admin's every
# Website Content write died with 42501 "permission denied for table articles"
# — a GRANT-level denial, not an RLS one — because the 20260918 content tables
# were never covered by the project's default privileges. The harness CANNOT
# see this class of bug: step 2 sets ALTER DEFAULT PRIVILEGES, so every table
# it creates is granted automatically. Assert the end state anyway, then prove
# 20261007 alone can restore it: strip the grants and re-apply that one file.
grants_ok "content tables are granted to authenticated (full DML) and anon (read)" \
  "SELECT bool_and(has_table_privilege('authenticated', c.oid, 'SELECT')
                AND has_table_privilege('authenticated', c.oid, 'INSERT')
                AND has_table_privilege('authenticated', c.oid, 'UPDATE')
                AND has_table_privilege('authenticated', c.oid, 'DELETE')
                AND has_table_privilege('anon', c.oid, 'SELECT'))
   FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public'
     AND c.relname IN ('practice_areas','articles','specialists','corporate_clients',
                       'faqs','seminar_events','retainer_packages','profile_practice_areas');" \
  "t"

$PSQL -c "REVOKE ALL ON public.practice_areas, public.articles, public.specialists,
          public.corporate_clients, public.faqs, public.seminar_events,
          public.retainer_packages, public.profile_practice_areas
          FROM anon, authenticated, service_role;" >/dev/null 2>&1
grants_ok "control: the content grants really are gone" \
  "SELECT has_table_privilege('authenticated', 'public.articles', 'UPDATE')
      OR has_table_privilege('anon', 'public.articles', 'SELECT');" "f"
if $PSQL -f "$REPO/supabase/migrations/20261007_content_table_grants.sql" \
     > "$WORKDIR/grants.out" 2>"$WORKDIR/grants.err"; then
  grants_ok "20261007 restores the content grants on its own" \
    "SELECT bool_and(has_table_privilege('authenticated', c.oid, 'SELECT')
                  AND has_table_privilege('authenticated', c.oid, 'UPDATE')
                  AND has_table_privilege('anon', c.oid, 'SELECT'))
     FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public'
       AND c.relname IN ('practice_areas','articles','specialists','corporate_clients',
                         'faqs','seminar_events','retainer_packages','profile_practice_areas');" \
    "t"
else
  fail "20261007 could not be re-applied once the content grants were revoked"
  grep -i error "$WORKDIR/grants.err" | head -5
fi

# The admin path must also survive the policy swap 20261007 performs: it
# replaces the inline role subquery with private.is_admin(), so an admin
# write must still be allowed, and a lawyer's must still be denied.
try_as "admin CAN still write content after the policy swap" "$ADMIN" allow \
  "INSERT INTO public.articles (id, title, slug, excerpt, content, category) VALUES ('grant-check','Grant Check','grant-check','x','x','x');"
try_as "lawyer still CANNOT write content after the policy swap" "$LAWYER" deny \
  "INSERT INTO public.articles (id, title, slug, excerpt, content, category) VALUES ('grant-check-2','Grant Check 2','grant-check-2','x','x','x');"
$PSQL -q -c "DELETE FROM public.articles WHERE id = 'grant-check';" >/dev/null 2>&1

# ── 7c. Inquiry attachments ─────────────────────────────────────────────────
# The public form uploads files as a signed-out visitor and then links them to
# the inquiry by reference number. Exercise the whole anonymous path, then the
# staff-only read.
grants_ok "the attachment bucket is private and the upload policy is insert-only" \
  "SELECT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'inquiry-attachments' AND public = FALSE)
      AND EXISTS (SELECT 1 FROM pg_policies
                  WHERE schemaname = 'storage' AND tablename = 'objects'
                    AND policyname = 'inquiry_attachments_storage_insert'
                    AND cmd = 'INSERT' AND with_check LIKE '%inquiry-attachments%')
      AND EXISTS (SELECT 1 FROM pg_policies
                  WHERE schemaname = 'storage' AND tablename = 'objects'
                    AND policyname = 'inquiry_attachments_storage_select'
                    AND cmd = 'SELECT');" \
  "t"

grants_ok "anon cannot read the attachment table directly" \
  "SELECT NOT has_table_privilege('anon', 'public.inquiry_attachments', 'SELECT');" "t"

# Functional pass: submit as anon, then attach as anon, exactly as the browser
# does it. submit_inquiry() hands back the reference the attach call needs.
REF=$($PSQL -tA -c "SET ROLE anon;
  SELECT public.submit_inquiry('Attach Fixture','attach@example.com',NULL,'labor',NULL,'Fixture for attachments',NULL);" 2>&1 | tr -d '[:space:]')
if [ -z "$REF" ] || echo "$REF" | grep -qi error; then
  fail "could not create the attachment fixture inquiry (got '$REF')"
else
  ATTACH=$($PSQL -tA -c "SET ROLE anon;
    SELECT public.attach_inquiry_files('$REF',
      '[{\"path\":\"inquiries/fixture/note.pdf\",\"name\":\"note.pdf\",\"mime\":\"application/pdf\",\"size\":\"1234\"}]'::jsonb);" 2>&1 | tr -d '[:space:]')
  if [ "$ATTACH" = "1" ]; then
    pass "a signed-out visitor can attach a file to their own inquiry"
  else
    fail "anon attach_inquiry_files failed (got '$ATTACH')"
  fi

  # Shape validation: a traversal path or a bad prefix must be refused.
  BADPATH=$($PSQL -tA -c "SET ROLE anon;
    SELECT public.attach_inquiry_files('$REF',
      '[{\"path\":\"inquiries/../../etc/passwd\",\"name\":\"x\",\"mime\":\"text/plain\",\"size\":\"1\"}]'::jsonb);" 2>&1)
  if echo "$BADPATH" | grep -q 'Invalid attachment path'; then
    pass "a traversal path is refused"
  else
    fail "a traversal path was not refused (got '$(echo "$BADPATH" | tr -d '\n' | head -c 80)')"
  fi

  ROWS=$($PSQL -tA -c "SELECT count(*) FROM public.inquiry_attachments;" 2>&1 | tr -d '[:space:]')
  if [ "$ROWS" = "1" ]; then
    pass "exactly the one valid attachment was recorded"
  else
    fail "expected 1 attachment row, found '$ROWS'"
  fi
fi

# 20261005 section 11c claims the chain no longer depends on schema-production.sql
# for USAGE on the private schema. This harness applies schema-production.sql in
# step 3, so the end-state assertion above cannot tell the two apart. Strip the
# grant the base file would have left and re-apply 20261005 alone: the only
# thing that can put it back is 11c. This doubles as a standalone idempotency
# check of the one migration in the chain that rewrites policies.
$PSQL -c "REVOKE ALL ON SCHEMA private FROM authenticated;" >/dev/null 2>&1
grants_ok "control: the private schema grant really is gone" \
  "SELECT has_schema_privilege('authenticated', 'private', 'USAGE');" "f"
if $PSQL -f "$REPO/supabase/migrations/20261005_security_advisor_fixes.sql" \
     > "$WORKDIR/secfix.out" 2>"$WORKDIR/secfix.err"; then
  grants_ok "20261005 section 11c restores it on its own" \
    "SELECT has_schema_privilege('authenticated', 'private', 'USAGE')
        AND NOT has_schema_privilege('anon', 'private', 'USAGE');" "t"
else
  fail "20261005 could not be re-applied once the schema grant was revoked"
  grep -i error "$WORKDIR/secfix.err" | head -5
fi

# ── Reproduce the live shapes that killed the pastes of 2026-09-30 ──────────
# Two live-only differences from this harness, both invisible here until now:
#
#   (a) soft_delete_profile / reactivate_profile do not exist on live (20260916
#       is not in the manifest; 20261005 section 4 only hardens them where they
#       already exist). The grid's has_function_privilege() call with a literal
#       signature RAISES 42883 for a missing function instead of returning
#       false, so the paste died on its last statement.
#   (b) inquiries_insert_public (WITH CHECK true) is a leftover from the ad-hoc
#       schema live was built from; no migration in this file ever dropped it.
#       It tripped the grid's "no always-true policy remains" check AND,
#       because permissive policies OR together, silently voided 20261005
#       section 7 — forged status/assigned_to/client_id inserts still passed.
#
# This harness applies 20260916 in step 5 and schema-production's (specific)
# inquiries_insert_public, so neither bug is visible without help. Recreate
# both exactly as live has them, re-apply the combined file, and require: the
# functions stay absent (section 4's skip path), the policy is dropped, the
# grid reads no FAIL, and the forged-insert denial holds.
$PSQL -q -c "DROP FUNCTION IF EXISTS public.soft_delete_profile(UUID); DROP FUNCTION IF EXISTS public.reactivate_profile(UUID);" >/dev/null 2>&1
$PSQL -q -c "DROP POLICY IF EXISTS inquiries_insert_public ON public.inquiries;
             CREATE POLICY inquiries_insert_public ON public.inquiries FOR INSERT TO anon, authenticated WITH CHECK (true);" >/dev/null 2>&1
LEFTFNS=$($PSQL -tA -c "SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                        WHERE n.nspname = 'public' AND p.proname IN ('soft_delete_profile','reactivate_profile');" 2>&1 | tr -d '[:space:]')
LEFTPOL=$($PSQL -tA -c "SELECT count(*) FROM pg_policies WHERE schemaname='public' AND policyname='inquiries_insert_public';" 2>&1 | tr -d '[:space:]')
if [ "$LEFTFNS" != "0" ] || [ "$LEFTPOL" != "1" ]; then
  fail "harness: could not recreate the live shape (functions left=$LEFTFNS, policy left=$LEFTPOL)"
elif $PSQL -f "$COMBINED" >/dev/null 2>"$WORKDIR/liveshape.err"; then
  STILLFNS=$($PSQL -tA -c "SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                           WHERE n.nspname = 'public' AND p.proname IN ('soft_delete_profile','reactivate_profile');" 2>&1 | tr -d '[:space:]')
  if [ "$STILLFNS" = "0" ]; then
    pass "the re-apply does not resurrect the soft-delete functions (section 4 skip path)"
  else
    fail "the re-apply resurrected the soft-delete functions (left=$STILLFNS)"
  fi
  STILLPOL=$($PSQL -tA -c "SELECT count(*) FROM pg_policies WHERE schemaname='public' AND policyname='inquiries_insert_public';" 2>&1 | tr -d '[:space:]')
  if [ "$STILLPOL" = "0" ]; then
    pass "the always-true inquiries_insert_public is dropped by the re-apply"
  else
    fail "inquiries_insert_public survived the re-apply (left=$STILLPOL) — the grid FAIL the owner saw"
  fi
  sed -n '/## VERIFICATION/,$p' "$COMBINED" > "$WORKDIR/verify-liveshape.sql"
  if $PSQL -f "$WORKDIR/verify-liveshape.sql" > "$WORKDIR/verify-liveshape.out" 2>&1; then
    if grep -q 'FAIL' "$WORKDIR/verify-liveshape.out"; then
      fail "the verification grid reports FAIL in the live shape"
      grep -B2 'FAIL' "$WORKDIR/verify-liveshape.out" | head -10
    else
      pass "the verification grid survives the live shape (functions absent, stale policy present)"
    fi
  else
    fail "the verification grid raised in the live shape — the 42883 bug"
    grep -i error "$WORKDIR/verify-liveshape.out" | head -5
  fi
  # With the true policy gone, section 7 alone must still refuse the forgery.
  try_as "the forged-insert denial holds once the stale true policy is gone" "" deny \
    "INSERT INTO public.inquiries (name, email, message, subject, practice_area, status, client_id) VALUES ('Forged','forged@example.com','x','General','labor','New','$CLIENT');" anon
else
  fail "the combined file failed to re-apply in the live shape"
  grep -i error "$WORKDIR/liveshape.err" | head -3
fi

# Reproduce the live shape that broke the diagnostic: drop the helper 20260929
# creates, exactly as the live project is missing it. Last, because it
# deliberately leaves the database in the broken state it is testing.
#
# CASCADE, because documents_storage_insert references the function and
# Postgres refuses a plain DROP while a policy depends on it — which is itself
# the reason the live project could not have this function without also having
# 20260929's policy.
$PSQL -q -c "DROP FUNCTION IF EXISTS private.user_can_access_matter_path(TEXT) CASCADE;" >/dev/null 2>&1
if $PSQL -f "$REPO/supabase/tests/diagnose-console-errors.sql" > "$WORKDIR/diag2.out" 2>"$WORKDIR/diag2.err"; then
  if grep -q 'MISSING' "$WORKDIR/diag2.out"; then
    pass "the diagnostic reports a dropped helper as MISSING instead of erroring"
  else
    fail "the diagnostic ran but did not flag the dropped helper as MISSING"
  fi
else
  fail "the diagnostic errored when a helper was absent — that is the bug it must not have"
  grep -i error "$WORKDIR/diag2.err" | head -5
fi

echo
if [ "$FAILURES" -eq 0 ]; then
  echo "ALL CHECKS PASSED"
else
  echo "$FAILURES CHECK(S) FAILED"
fi
exit "$FAILURES"
