-- ============================================================================
-- Role test script for 20261001. Run ONCE in the Supabase SQL editor after the
-- migration. Everything runs inside a transaction that is ROLLED BACK, so it
-- leaves no data behind. Read the "Messages"/NOTICE output: every line should
-- start with PASS. Any FAIL line (or an error) means a rule is not enforced.
-- Needs at least 1 admin, 2 lawyers and 1 client in public.profiles.
-- ============================================================================
BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.as_user(p_uid UUID) RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::TEXT, TRUE);
  PERFORM set_config('request.jwt.claim.sub', p_uid::TEXT, TRUE);
  EXECUTE 'SET LOCAL ROLE authenticated';
END $$;

-- runs sql as the current user; PASS if it raises/affects nothing when p_should_work is false
CREATE OR REPLACE FUNCTION pg_temp.check_write(p_label TEXT, p_sql TEXT, p_should_work BOOLEAN) RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE n INT;
BEGIN
  BEGIN
    EXECUTE p_sql; GET DIAGNOSTICS n = ROW_COUNT;
    IF p_should_work AND n > 0 THEN RAISE NOTICE 'PASS  %', p_label;
    ELSIF NOT p_should_work AND n = 0 THEN RAISE NOTICE 'PASS  % (0 rows)', p_label;
    ELSE RAISE NOTICE 'FAIL  % (rows affected: %)', p_label, n; END IF;
  EXCEPTION WHEN OTHERS THEN
    IF p_should_work THEN RAISE NOTICE 'FAIL  % -> %', p_label, SQLERRM;
    ELSE RAISE NOTICE 'PASS  % (blocked: %)', p_label, left(SQLERRM, 60); END IF;
  END;
END $$;

CREATE OR REPLACE FUNCTION pg_temp.check_count(p_label TEXT, p_sql TEXT, p_expected INT) RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE n INT;
BEGIN
  EXECUTE p_sql INTO n;
  IF n = p_expected THEN RAISE NOTICE 'PASS  % (=%)', p_label, n; ELSE RAISE NOTICE 'FAIL  % (got %, expected %)', p_label, n, p_expected; END IF;
END $$;

DO $t$
DECLARE
  v_admin UUID; v_l1 UUID; v_l2 UUID; v_client UUID; v_m UUID; v_doc_conf UUID; v_doc_client UUID; v_doc_confid UUID;
BEGIN
  SELECT id INTO v_admin  FROM public.profiles WHERE role='admin'  LIMIT 1;
  SELECT id INTO v_l1     FROM public.profiles WHERE role='lawyer' ORDER BY id LIMIT 1;
  SELECT id INTO v_l2     FROM public.profiles WHERE role='lawyer' AND id <> v_l1 ORDER BY id LIMIT 1;
  SELECT id INTO v_client FROM public.profiles WHERE role='client' LIMIT 1;
  IF v_admin IS NULL OR v_l1 IS NULL OR v_l2 IS NULL OR v_client IS NULL THEN
    RAISE EXCEPTION 'Need 1 admin, 2 lawyers, 1 client in profiles to run these tests'; END IF;

  -- fixtures (as superuser)
  INSERT INTO public.matters(matter_number, client_id, lawyer_id, practice_area, status, title, description)
  VALUES ('TEST-0001', v_client, v_l1, 'Labor', 'Under Review', 'Test matter', 'fixture') RETURNING id INTO v_m;
  INSERT INTO public.documents(matter_id, name, file_path, file_type, file_size, access_level, uploaded_by)
  VALUES (v_m, 'secret.pdf', v_m || '/secret.pdf', 'application/pdf', 10, 'Confidential', v_l1) RETURNING id INTO v_doc_conf;
  INSERT INTO public.documents(matter_id, name, file_path, file_type, file_size, access_level, uploaded_by)
  VALUES (v_m, 'shared.pdf', v_m || '/shared.pdf', 'application/pdf', 10, 'Client & Assigned Lawyer', v_l1) RETURNING id INTO v_doc_client;

  -- ---- CLIENT --------------------------------------------------------------
  PERFORM pg_temp.as_user(v_client);
  PERFORM pg_temp.check_write('client cannot change matter status', format('UPDATE public.matters SET status=''Active'' WHERE id=%L', v_m), FALSE);
  PERFORM pg_temp.check_write('client cannot change matter lawyer', format('UPDATE public.matters SET lawyer_id=%L WHERE id=%L', v_l2, v_m), FALSE);
  PERFORM pg_temp.check_write('client cannot create a matter', format('INSERT INTO public.matters(matter_number,client_id,lawyer_id,practice_area,title,description) VALUES (''TEST-X'',%L,%L,''Labor'',''x'',''x'')', v_client, v_l1), FALSE);
  PERFORM pg_temp.check_count('client sees own matter', format('SELECT count(*) FROM public.matters WHERE id=%L', v_m), 1);
  PERFORM pg_temp.check_count('client cannot see Confidential doc row', format('SELECT count(*) FROM public.documents WHERE id=%L', v_doc_conf), 0);
  PERFORM pg_temp.check_count('client sees shared doc row', format('SELECT count(*) FROM public.documents WHERE id=%L', v_doc_client), 1);
  PERFORM pg_temp.check_write('client cannot promote own role', format('UPDATE public.profiles SET role=''admin'' WHERE id=%L', v_client), FALSE);
  PERFORM pg_temp.check_write('client can edit own city', format('UPDATE public.profiles SET city=''Quezon City'' WHERE id=%L', v_client), TRUE);
  PERFORM pg_temp.check_write('client cannot set a future birthday', format('UPDATE public.profiles SET date_of_birth=current_date+30 WHERE id=%L', v_client), FALSE);
  PERFORM pg_temp.check_write('client can request appointment (Pending)', format('INSERT INTO public.appointments(matter_id,client_id,lawyer_id,appointment_type,date,time,mode,status) VALUES (%L,%L,%L,''Consultation'',current_date+3,''10:00 AM'',''In-Person'',''Pending'')', v_m, v_client, v_l1), TRUE);
  PERFORM pg_temp.check_write('client cannot self-confirm appointment', 'UPDATE public.appointments SET status=''Confirmed''', FALSE);
  PERFORM pg_temp.check_write('client cannot add internal note', format('INSERT INTO public.matter_notes(matter_id,author_id,body,visibility) VALUES (%L,%L,''x'',''internal'')', v_m, v_client), FALSE);
  RESET ROLE;

  -- ---- OTHER LAWYER (not on the matter) -------------------------------------
  PERFORM pg_temp.as_user(v_l2);
  PERFORM pg_temp.check_count('unrelated lawyer cannot see matter', format('SELECT count(*) FROM public.matters WHERE id=%L', v_m), 0);
  PERFORM pg_temp.check_count('unrelated lawyer cannot see Confidential row', format('SELECT count(*) FROM public.documents WHERE id=%L', v_doc_conf), 0);
  RESET ROLE;

  -- ---- ASSIGNED LAWYER -------------------------------------------------------
  PERFORM pg_temp.as_user(v_l1);
  PERFORM pg_temp.check_count('assigned lawyer sees Confidential doc', format('SELECT count(*) FROM public.documents WHERE id=%L', v_doc_conf), 1);
  PERFORM pg_temp.check_write('lawyer: skip conflict check (Under Review -> Active) blocked', format('UPDATE public.matters SET status=''Active'' WHERE id=%L', v_m), FALSE);
  PERFORM pg_temp.check_write('lawyer: Under Review -> Conflict Check', format('UPDATE public.matters SET status=''Conflict Check'' WHERE id=%L', v_m), TRUE);
  PERFORM pg_temp.check_write('lawyer: Conflict Check -> Accepted', format('UPDATE public.matters SET status=''Accepted'' WHERE id=%L', v_m), TRUE);
  PERFORM pg_temp.check_write('lawyer cannot reassign lawyer', format('UPDATE public.matters SET lawyer_id=%L WHERE id=%L', v_l2, v_m), FALSE);
  PERFORM pg_temp.check_write('lawyer can upload Confidential doc row', format('INSERT INTO public.documents(matter_id,name,file_path,file_type,file_size,access_level,uploaded_by) VALUES (%L,''n.pdf'',%L,''application/pdf'',1,''Confidential'',%L)', v_m, v_m || '/n.pdf', v_l1), TRUE);
  PERFORM pg_temp.check_write('lawyer can add internal note', format('INSERT INTO public.matter_notes(matter_id,author_id,body,visibility) VALUES (%L,%L,''strategy'',''internal'')', v_m, v_l1), TRUE);
  PERFORM pg_temp.check_write('lawyer can add second lawyer to team', format('INSERT INTO public.matter_members(matter_id,lawyer_id) VALUES (%L,%L)', v_m, v_l2), TRUE);
  PERFORM pg_temp.check_write('lawyer can confirm appointment', 'UPDATE public.appointments SET status=''Confirmed''', TRUE);
  RESET ROLE;

  -- ---- LAWYER ADDED TO TEAM now sees Confidential ---------------------------
  PERFORM pg_temp.as_user(v_l2);
  PERFORM pg_temp.check_count('team lawyer now sees Confidential row', format('SELECT count(*) FROM public.documents WHERE id=%L', v_doc_conf), 1);
  RESET ROLE;

  -- ---- ADMIN ---------------------------------------------------------------
  PERFORM pg_temp.as_user(v_admin);
  PERFORM pg_temp.check_count('admin sees Confidential METADATA', format('SELECT count(*) FROM public.documents WHERE id=%L', v_doc_conf), 1);
  PERFORM pg_temp.check_count('admin content access before break-glass = no', format('SELECT count(*) FROM (SELECT private.can_read_document_content(%L)::INT AS ok) x WHERE ok=1', v_doc_conf), 0);
  PERFORM pg_temp.check_count('admin cannot see internal notes', format('SELECT count(*) FROM public.matter_notes WHERE matter_id=%L AND visibility=''internal''', v_m), 0);
  PERFORM pg_temp.check_write('admin cannot downgrade Confidential doc', format('UPDATE public.documents SET access_level=''Staff Shared'' WHERE id=%L', v_doc_conf), FALSE);
  PERFORM pg_temp.check_write('admin cannot delete Confidential doc', format('DELETE FROM public.documents WHERE id=%L', v_doc_conf), FALSE);
  PERFORM pg_temp.check_write('break-glass without reason fails', format('SELECT public.break_glass_open_document(%L, ''short'')', v_doc_conf), FALSE);
  PERFORM pg_temp.check_write('admin can reassign lawyer', format('UPDATE public.matters SET lawyer_id=%L WHERE id=%L', v_l2, v_m), TRUE);
  PERFORM pg_temp.check_write('admin can change a role', format('UPDATE public.profiles SET position=''Test'' WHERE id=%L', v_l2), TRUE);
  PERFORM pg_temp.check_write('admin break-glass with reason works', format('SELECT public.break_glass_open_document(%L, ''Court order requires production of the file'')', v_doc_conf), TRUE);
  PERFORM pg_temp.check_count('admin content access after break-glass = yes', format('SELECT private.can_read_document_content(%L)::INT', v_doc_conf), 1);
  RESET ROLE;

  -- ---- Audit + timeline written --------------------------------------------
  PERFORM pg_temp.check_count('break-glass was audited', 'SELECT count(*) FROM public.audit_logs WHERE event_type=''CONFIDENTIAL_BREAK_GLASS''', 1);
  PERFORM pg_temp.check_count('profile edit was audited', 'SELECT count(*) FROM public.audit_logs WHERE event_type=''PROFILE_UPDATED''', 1);
  PERFORM pg_temp.check_count('assigned lawyer was notified of break-glass', format('SELECT count(*) FROM public.notifications WHERE user_id=%L AND title ILIKE ''Confidential document opened%%''', v_l2), 1);
  PERFORM pg_temp.check_count('timeline has status events', format('SELECT count(*) FROM public.matter_events WHERE matter_id=%L AND event_type=''status''', v_m), 2);

  -- ---- Anonymous visitors -----------------------------------------------------
  PERFORM set_config('request.jwt.claims', '{"role":"anon"}', TRUE);
  EXECUTE 'SET LOCAL ROLE anon';
  PERFORM pg_temp.check_count('anon: public_lawyers is readable and non-empty', 'SELECT CASE WHEN count(*) > 0 THEN 1 ELSE 0 END FROM public.public_lawyers', 1);
  PERFORM pg_temp.check_count('anon: cannot read matters', 'SELECT count(*) FROM public.matters', 0);
  RESET ROLE;
END $t$;

ROLLBACK;
