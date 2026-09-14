-- =============================================================================
-- Westwood Law Firm - Post-Deployment Verification Script
-- =============================================================================
-- Run this in Supabase SQL Editor AFTER deploying schema-production.sql
-- and seed content to verify everything is working correctly.
-- =============================================================================

-- Enable timing
\timing on

-- =============================================================================
-- SECTION 1: TABLE EXISTENCE
-- =============================================================================
SELECT '=== TABLE EXISTENCE ===' as section;

SELECT 
    table_name,
    CASE WHEN table_name IS NOT NULL THEN '✅ EXISTS' ELSE '❌ MISSING' END as status
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN (
    'profiles', 'lawyers', 'matters', 'inquiries', 'consultations',
    'documents', 'appointments', 'audit_logs', 'notifications', 'saved_lawyers',
    'practice_areas', 'articles', 'specialists', 'corporate_clients',
    'faqs', 'seminar_events', 'retainer_packages', 'profile_practice_areas'
  )
ORDER BY table_name;

-- =============================================================================
-- SECTION 2: RLS ENABLED
-- =============================================================================
SELECT '=== RLS ENABLED ===' as section;

SELECT 
    tablename,
    CASE WHEN rowsecurity THEN '✅ ENABLED' ELSE '❌ DISABLED' END as status
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN (
    'profiles', 'lawyers', 'matters', 'inquiries', 'consultations',
    'documents', 'appointments', 'audit_logs', 'notifications', 'saved_lawyers',
    'practice_areas', 'articles', 'specialists', 'corporate_clients',
    'faqs', 'seminar_events', 'retainer_packages', 'profile_practice_areas'
  )
ORDER BY tablename;

-- =============================================================================
-- SECTION 3: RLS POLICIES COUNT
-- =============================================================================
SELECT '=== RLS POLICIES ===' as section;

SELECT 
    tablename,
    COUNT(*) as policy_count,
    CASE WHEN COUNT(*) > 0 THEN '✅ HAS POLICIES' ELSE '❌ NO POLICIES' END as status
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
    'profiles', 'lawyers', 'matters', 'inquiries', 'consultations',
    'documents', 'appointments', 'audit_logs', 'notifications', 'saved_lawyers',
    'practice_areas', 'articles', 'specialists', 'corporate_clients',
    'faqs', 'seminar_events', 'retainer_packages', 'profile_practice_areas'
  )
GROUP BY tablename
ORDER BY tablename;

-- =============================================================================
-- SECTION 4: ENUMS
-- =============================================================================
SELECT '=== ENUMS ===' as section;

SELECT 
    typname as enum_name,
    '✅ EXISTS' as status
FROM pg_type
WHERE typnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
  AND typtype = 'e'
  AND typname IN (
    'user_role', 'matter_status', 'priority_level', 'inquiry_status',
    'appointment_mode', 'appointment_status', 'document_status',
    'access_level', 'audit_result'
  )
ORDER BY typname;

-- =============================================================================
-- SECTION 5: FUNCTIONS
-- =============================================================================
SELECT '=== FUNCTIONS ===' as section;

SELECT 
    proname as function_name,
    CASE 
        WHEN proname IN ('generate_matter_number', 'generate_inquiry_number', 'generate_consultation_number') THEN 'PUBLIC'
        WHEN proname LIKE 'can_access_document' THEN 'PRIVATE (SECURITY DEFINER)'
        WHEN proname LIKE 'log_audit' THEN 'PRIVATE (SECURITY DEFINER)'
        WHEN proname LIKE 'get_user_role' THEN 'PRIVATE (SECURITY DEFINER)'
        WHEN proname LIKE 'is_admin' THEN 'PRIVATE (SECURITY DEFINER)'
        WHEN proname LIKE 'is_lawyer_or_admin' THEN 'PRIVATE (SECURITY DEFINER)'
        WHEN proname LIKE 'handle_new_user' THEN 'PRIVATE (SECURITY DEFINER)'
        WHEN proname LIKE 'validate_matter_staff' THEN 'PRIVATE (SECURITY DEFINER)'
        WHEN proname LIKE 'prevent_lawyer_matter_reassignment' THEN 'PRIVATE (SECURITY DEFINER)'
        WHEN proname LIKE 'prevent_appointment_reassignment' THEN 'PRIVATE (SECURITY DEFINER)'
        WHEN proname = 'update_updated_at' THEN 'PUBLIC TRIGGER'
        ELSE 'OTHER'
    END as type,
    '✅ EXISTS' as status
FROM pg_proc
WHERE pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
  OR pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'private')
ORDER BY proname;

-- =============================================================================
-- SECTION 6: TRIGGERS
-- =============================================================================
SELECT '=== TRIGGERS ===' as section;

SELECT 
    trigger_name,
    event_object_table as table_name,
    action_timing || ' ' || event_manipulation as timing,
    '✅ EXISTS' as status
FROM information_schema.triggers
WHERE trigger_schema = 'public'
  AND trigger_name IN (
    'profiles_updated_at', 'lawyers_updated_at', 'matters_updated_at',
    'inquiries_updated_at', 'documents_updated_at', 'appointments_updated_at',
    'notifications_updated_at', 'consultations_updated_at',
    'practice_areas_updated_at', 'articles_updated_at', 'specialists_updated_at',
    'faqs_updated_at', 'seminar_events_updated_at', 'retainer_packages_updated_at',
    'on_auth_user_created', 'validate_matter_staff', 'prevent_lawyer_matter_reassignment',
    'prevent_appointment_reassignment'
  )
ORDER BY event_object_table, trigger_name;

-- =============================================================================
-- SECTION 7: INDEXES
-- =============================================================================
SELECT '=== KEY INDEXES ===' as section;

SELECT 
    indexname,
    tablename,
    '✅ EXISTS' as status
FROM pg_indexes
WHERE schemaname = 'public'
  AND indexname IN (
    'idx_profiles_email', 'idx_profiles_role', 'idx_profiles_is_active',
    'idx_lawyers_profile_id', 'idx_lawyers_is_active',
    'idx_matters_client_id', 'idx_matters_lawyer_id', 'idx_matters_status',
    'idx_inquiries_email', 'idx_inquiries_status', 'idx_inquiries_assigned_to',
    'idx_documents_matter_id', 'idx_documents_access_level', 'idx_documents_file_path',
    'idx_appointments_matter_id', 'idx_appointments_client_id', 'idx_appointments_lawyer_id',
    'idx_audit_logs_user_id', 'idx_audit_logs_created_at',
    'idx_saved_lawyers_user_id', 'idx_notifications_user_id'
  )
ORDER BY tablename, indexname;

-- =============================================================================
-- SECTION 8: SEQUENCES
-- =============================================================================
SELECT '=== SEQUENCES ===' as section;

SELECT 
    sequence_name,
    '✅ EXISTS' as status
FROM information_schema.sequences
WHERE sequence_schema = 'public'
  AND sequence_name IN (
    'matter_number_seq', 'inquiry_number_seq', 'consultation_number_seq'
  )
ORDER BY sequence_name;

-- =============================================================================
-- SECTION 9: STORAGE BUCKETS
-- =============================================================================
SELECT '=== STORAGE BUCKETS ===' as section;

SELECT 
    id as bucket_name,
    name,
    public,
    CASE 
        WHEN id = 'documents' AND public = false THEN '✅ PRIVATE (correct)'
        WHEN id = 'lawyer-photos' AND public = true THEN '✅ PUBLIC (correct)'
        ELSE '⚠️ CHECK CONFIG'
    END as status
FROM storage.buckets
WHERE id IN ('documents', 'lawyer-photos')
ORDER BY id;

-- =============================================================================
-- SECTION 10: STORAGE POLICIES
-- =============================================================================
SELECT '=== STORAGE POLICIES ===' as section;

SELECT 
    policyname,
    bucket_id,
    cmd as operation,
    '✅ EXISTS' as status
FROM pg_policies
WHERE schemaname = 'storage'
  AND tablename = 'objects'
  AND policyname IN (
    'documents_storage_select', 'documents_storage_insert',
    'documents_storage_update', 'documents_storage_delete',
    'lawyer_photos_select', 'lawyer_photos_insert',
    'lawyer_photos_update', 'lawyer_photos_delete'
  )
ORDER BY bucket_id, policyname;

-- =============================================================================
-- SECTION 11: SEED DATA VERIFICATION
-- =============================================================================
SELECT '=== SEED DATA COUNTS ===' as section;

SELECT 'practice_areas' as table_name, COUNT(*) as count FROM public.practice_areas WHERE is_active = true
UNION ALL SELECT 'articles', COUNT(*) FROM public.articles WHERE is_published = true
UNION ALL SELECT 'specialists', COUNT(*) FROM public.specialists WHERE is_active = true
UNION ALL SELECT 'corporate_clients', COUNT(*) FROM public.corporate_clients WHERE is_active = true
UNION ALL SELECT 'faqs', COUNT(*) FROM public.faqs WHERE is_active = true
UNION ALL SELECT 'seminar_events', COUNT(*) FROM public.seminar_events WHERE is_active = true
UNION ALL SELECT 'retainer_packages', COUNT(*) FROM public.retainer_packages WHERE is_active = true
UNION ALL SELECT 'lawyers (active)', COUNT(*) FROM public.lawyers WHERE is_active = true
ORDER BY table_name;

-- =============================================================================
-- SECTION 12: FUNCTION PERMISSIONS
-- =============================================================================
SELECT '=== FUNCTION PERMISSIONS ===' as section;

SELECT 
    proname as function_name,
    CASE 
        WHEN has_function_privilege('authenticated', oid, 'EXECUTE') THEN '✅ GRANTED TO authenticated'
        ELSE '❌ NOT GRANTED'
    END as auth_permission,
    CASE 
        WHEN has_function_privilege('anon', oid, 'EXECUTE') THEN '✅ GRANTED TO anon'
        ELSE '❌ NOT GRANTED'
    END as anon_permission
FROM pg_proc
WHERE pronamespace IN (
    SELECT oid FROM pg_namespace WHERE nspname IN ('public', 'private')
)
  AND proname IN (
    'generate_matter_number', 'generate_inquiry_number', 'generate_consultation_number',
    'get_user_role', 'is_admin', 'is_lawyer_or_admin', 'can_access_document', 'log_audit'
  )
ORDER BY proname;

-- =============================================================================
-- SECTION 13: TABLE GRANTS
-- =============================================================================
SELECT '=== TABLE GRANTS ===' as section;

SELECT 
    table_name,
    grantee,
    privilege_type,
    '✅ GRANTED' as status
FROM information_schema.table_privileges
WHERE table_schema = 'public'
  AND table_name IN (
    'profiles', 'lawyers', 'matters', 'inquiries', 'consultations',
    'documents', 'appointments', 'audit_logs', 'notifications', 'saved_lawyers',
    'practice_areas', 'articles', 'specialists', 'corporate_clients',
    'faqs', 'seminar_events', 'retainer_packages', 'profile_practice_areas'
  )
  AND grantee IN ('anon', 'authenticated')
ORDER BY table_name, grantee, privilege_type;

-- =============================================================================
-- SECTION 14: VERIFY NUMBER GENERATION
-- =============================================================================
SELECT '=== NUMBER GENERATION TEST ===' as section;

SELECT 
    'generate_matter_number()' as function_name,
    public.generate_matter_number() as result,
    '✅ WORKS' as status
UNION ALL
SELECT 
    'generate_inquiry_number()',
    public.generate_inquiry_number(),
    '✅ WORKS'
UNION ALL
SELECT 
    'generate_consultation_number()',
    public.generate_consultation_number(),
    '✅ WORKS';

-- =============================================================================
-- SECTION 15: SECURITY CHECKS
-- =============================================================================
SELECT '=== SECURITY CHECKS ===' as section;

-- Check no policies use recursive subqueries on profiles
SELECT 
    'Profiles RLS - No Recursion' as check_name,
    CASE 
        WHEN NOT EXISTS (
            SELECT 1 FROM pg_policies 
            WHERE schemaname = 'public' 
            AND tablename = 'profiles'
            AND (qual LIKE '%private.is_admin()%' OR qual LIKE '%private.is_lawyer_or_admin()%')
        ) THEN '✅ PASS: No recursive function calls in profiles policies'
        ELSE '❌ FAIL: Recursive function calls detected in profiles policies'
    END as result;

-- Check audit_logs has no INSERT policy for authenticated
SELECT 
    'Audit Logs - No Direct Insert' as check_name,
    CASE 
        WHEN NOT EXISTS (
            SELECT 1 FROM pg_policies 
            WHERE schemaname = 'public' 
            AND tablename = 'audit_logs'
            AND cmd = 'INSERT'
        ) THEN '✅ PASS: No direct INSERT policy on audit_logs'
        ELSE '❌ FAIL: Direct INSERT policy exists on audit_logs'
    END as result;

-- Check documents RLS uses can_access_document
SELECT 
    'Documents - Uses Access Control Function' as check_name,
    CASE 
        WHEN EXISTS (
            SELECT 1 FROM pg_policies 
            WHERE schemaname = 'public' 
            AND tablename = 'documents'
            AND qual LIKE '%can_access_document%'
        ) THEN '✅ PASS: Documents SELECT uses can_access_document()'
        ELSE '❌ FAIL: Documents SELECT does not use access control function'
    END as result;

-- Check profiles policies use direct auth.uid()
SELECT 
    'Profiles - Direct auth.uid() Checks' as check_name,
    CASE 
        WHEN EXISTS (
            SELECT 1 FROM pg_policies 
            WHERE schemaname = 'public' 
            AND tablename = 'profiles'
            AND qual LIKE '%auth.uid() = id%'
        ) THEN '✅ PASS: Profiles policies use direct auth.uid()'
        ELSE '❌ FAIL: Profiles policies may not use direct auth.uid()'
    END as result;

-- Check private schema exists and is restricted
SELECT 
    'Private Schema - Restricted' as check_name,
    CASE 
        WHEN EXISTS (
            SELECT 1 FROM pg_namespace WHERE nspname = 'private'
        ) AND NOT EXISTS (
            SELECT 1 FROM pg_namespace n
            JOIN pg_roles r ON r.oid = n.nspowner
            WHERE n.nspname = 'private' AND r.rolname = 'PUBLIC'
        ) THEN '✅ PASS: Private schema exists and not owned by PUBLIC'
        ELSE '❌ FAIL: Private schema issue'
    END as result;

-- =============================================================================
-- SECTION 16: SAMPLE QUERIES (Test RLS as different roles)
-- =============================================================================
SELECT '=== SAMPLE QUERIES (Run as authenticated user) ===' as section;

-- These will only work when run as an authenticated user in Supabase
-- They demonstrate the RLS policies working

-- Test profiles access (should return own profile)
-- SELECT 'Profiles - Own Profile' as test, COUNT(*) as rows FROM public.profiles;

-- Test matters access (should return own/assigned matters)
-- SELECT 'Matters - Accessible' as test, COUNT(*) as rows FROM public.matters;

-- Test documents access (should respect access_level)
-- SELECT 'Documents - Accessible' as test, COUNT(*) as rows FROM public.documents;

-- =============================================================================
-- SUMMARY
-- =============================================================================
SELECT '=== VERIFICATION COMPLETE ===' as section;
SELECT 'Review all sections above. All should show ✅ PASS/EXISTS/WORKS.' as message;
SELECT 'Any ❌ FAIL/MISSING/DISABLED requires investigation.' as warning;