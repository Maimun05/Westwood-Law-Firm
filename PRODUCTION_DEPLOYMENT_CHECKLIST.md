# Production Deployment Checklist

> **⚠️ CRITICAL**: Complete every item before going live. This checklist ensures security, reliability, and compliance.

---

## 📋 Pre-Deployment Requirements

### Infrastructure

- [ ] Supabase project created on **Pro plan** (for production SLA)
- [ ] Custom domain configured in Supabase (optional but recommended)
- [ ] Vercel/Netlify project connected to repository
- [ ] DNS records configured for production domain

### Secrets Management (NEVER commit these)

- [ ] `VITE_SUPABASE_URL` - Set in Vercel/Netlify environment variables
- [ ] `VITE_SUPABASE_ANON_KEY` - Set in Vercel/Netlify environment variables
- [ ] `SUPABASE_SERVICE_ROLE_KEY` - Set in **Supabase Dashboard → Edge Functions → Secrets** ONLY
- [ ] `SUPABASE_URL` - Set in **Supabase Dashboard → Edge Functions → Secrets**
- [ ] `SUPABASE_ANON_KEY` - Set in **Supabase Dashboard → Edge Functions → Secrets**

---

## 🗄️ Database Deployment

### 1. Deploy Schema

- [ ] Open Supabase Dashboard → SQL Editor
- [ ] Copy **entire contents** of `supabase/schema-production.sql`
- [ ] Paste and execute
- [ ] Verify no errors in execution log

### 2. Verify Schema Deployment

- [ ] Run `supabase/VERIFY_DEPLOYMENT.sql` in SQL Editor
- [ ] Confirm all 18 tables exist with RLS enabled
- [ ] Confirm all 9 enums created
- [ ] Confirm all 12+ functions created (public + private)
- [ ] Confirm all 25+ indexes created
- [ ] Confirm 3 sequences created
- [ ] Confirm 2 storage buckets created with correct public/private settings
- [ ] Confirm 8 storage policies created
- [ ] Confirm all GRANTs applied correctly

### 3. Seed Content Data

- [ ] Copy contents of `supabase/migrations/20260919_seed_content.sql`
- [ ] Execute in SQL Editor
- [ ] Verify seed counts:
  - [ ] 11 practice areas
  - [ ] 6 published articles
  - [ ] 4 specialists
  - [ ] 43 corporate clients
  - [ ] 8 FAQs
  - [ ] 3 seminar events
  - [ ] 3 retainer packages
  - [ ] 7 lawyers

### 4. Setup Database Webhook (Critical for Profile Creation)

- [ ] Go to Supabase Dashboard → Database → Webhooks
- [ ] Create new webhook:
  - **Name**: `create_profile_on_signup`
  - **Table**: `auth.users`
  - **Events**: `INSERT`
  - **Type**: `HTTP Request`
  - **URL**: `https://YOUR_PROJECT_REF.supabase.co/functions/v1/handle_new_user` (or use the built-in trigger)
  - **Headers**: `Authorization: Bearer SERVICE_ROLE_KEY`
- [ ] **Alternative**: The schema includes a trigger on `auth.users` - verify it's active:
  ```sql
  SELECT * FROM information_schema.triggers
  WHERE trigger_name = 'on_auth_user_created';
  ```

---

## ⚡ Edge Functions Deployment

### 1. Deploy `admin-create-user`

```bash
supabase functions deploy admin-create-user \
  --project-ref YOUR_PROJECT_REF \
  --env SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co \
  --env SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

### 2. Verify Function Works

- [ ] Go to Supabase Dashboard → Edge Functions
- [ ] Click `admin-create-user` → "Invoke"
- [ ] Test with valid admin JWT:
  ```json
  {
    "email": "test@example.com",
    "password": "securepass123",
    "fullName": "Test User",
    "role": "client"
  }
  ```
- [ ] Verify returns 201 with user object (no password)

### 3. Set Function Secrets (Dashboard → Edge Functions → Secrets)

- [ ] `SUPABASE_URL` = `https://YOUR_PROJECT_REF.supabase.co`
- [ ] `SUPABASE_SERVICE_ROLE_KEY` = `your_service_role_key`
- [ ] `SUPABASE_ANON_KEY` = `your_anon_key`

---

## 🔐 Authentication Configuration

### 1. Email Settings (Dashboard → Authentication → Settings)

- [ ] **Site URL**: `https://yourdomain.com`
- [ ] **Redirect URLs**: `https://yourdomain.com/**`, `https://yourdomain.com/reset-password`
- [ ] **Email Confirmations**: **ENABLED** (required for OTP flow)
- [ ] **Double Confirm Email Changes**: ENABLED
- [ ] **Secure Email Change**: ENABLED

### 2. Email Templates (Dashboard → Authentication → Email Templates)

- [ ] **Confirm Signup**: Customize with Westwood branding
- [ ] **Reset Password**: Customize with Westwood branding
- [ ] **Magic Link**: Customize (if used)
- [ ] **Invite User**: Customize (if used)

### 3. SMTP Configuration (Dashboard → Authentication → Settings → SMTP)

- [ ] Configure production SMTP (SendGrid, Resend, Postmark, etc.)
- [ ] Test email delivery
- [ ] Verify SPF/DKIM/DMARC records

### 4. Password Policy

- [ ] Min length: 8 characters (recommend 12)
- [ ] Require uppercase: YES
- [ ] Require lowercase: YES
- [ ] Require numbers: YES
- [ ] Require symbols: YES

---

## 👤 First Admin User

### 1. Create Account

- [ ] Go to `https://yourdomain.com/signup`
- [ ] Register with admin email
- [ ] Verify email via OTP

### 2. Promote to Admin

```sql
-- Run in Supabase SQL Editor
UPDATE public.profiles
SET role = 'admin'::public.user_role
WHERE email = 'admin@westwoodlaw.ph';
```

### 3. Verify Admin Access

- [ ] Login as admin
- [ ] Navigate to `/admin` - should show admin panel
- [ ] Test "Create User" functionality
- [ ] Test role changes
- [ ] Test user deactivation

---

## 🧪 Functional Testing

### Public Website

- [ ] Homepage loads
- [ ] Practice Areas page shows all 11 areas
- [ ] Lawyers page shows all 7 lawyers with filters
- [ ] Individual lawyer profile page works
- [ ] Articles/Insights page shows published articles
- [ ] Article detail page loads with view count increment
- [ ] Specialists/Partners page shows 4 partners
- [ ] Corporate Clients page shows logos
- [ ] FAQs page shows categorized questions
- [ ] Seminars page shows upcoming events
- [ ] Retainer Packages page shows 3 tiers
- [ ] Contact/Inquiry form submits successfully
- [ ] Consultation booking form submits successfully

### Authentication Flow

- [ ] Signup with email/password
- [ ] OTP verification email received
- [ ] OTP verification works (6-digit code)
- [ ] Resend OTP works
- [ ] Login with verified account works
- [ ] Login with unverified account shows "Verify Email" prompt
- [ ] Password reset request works
- [ ] Password reset link works
- [ ] Logout works
- [ ] Session persists on refresh

### Client Portal (Client Role)

- [ ] Login redirects to `/portal`
- [ ] Dashboard shows matters (empty initially)
- [ ] Documents page accessible
- [ ] Appointments page accessible
- [ ] Audit Logs page shows own logs
- [ ] Notifications bell works
- [ ] Profile page editable (name, phone)
- [ ] Cannot access admin routes

### Lawyer Portal (Lawyer Role)

- [ ] Login redirects to `/portal`
- [ ] Dashboard shows assigned matters
- [ ] Can update matter status (not ownership)
- [ ] Documents page shows assigned matter documents
- [ ] Appointments page shows assigned appointments
- [ ] Can update appointment status
- [ ] Cannot access admin routes

### Admin Panel (Admin Role)

- [ ] Login redirects to `/admin`
- [ ] Users list shows all users
- [ ] Create user works (Edge Function)
- [ ] Edit user works (name, phone, role)
- [ ] Change role works
- [ ] Deactivate user works (soft delete)
- [ ] Delete user works (with confirmation)
- [ ] Content management accessible (if implemented)

### Document Management

- [ ] Upload document to matter (client/lawyer)
- [ ] Download document (respects access_level)
- [ ] Access levels enforced:
  - [ ] Public - anyone authenticated
  - [ ] Staff Shared - lawyers + admins
  - [ ] Client & Assigned Lawyer - only those two + admin
  - [ ] Lawyer Only - only assigned lawyer + admin
  - [ ] Confidential - admin only
- [ ] Storage RLS matches database RLS
- [ ] File size limits enforced
- [ ] File type restrictions work

### Audit Logging

- [ ] Login event logged
- [ ] Logout event logged
- [ ] Document upload logged
- [ ] Matter creation logged
- [ ] Role change logged
- [ ] Failed login attempts logged
- [ ] Users see only own logs
- [ ] Admins see all logs

---

## 🔒 Security Verification

### RLS Policy Testing

Test each policy by logging in as different roles:

| Test                | Client                | Lawyer                | Admin | Anonymous |
| ------------------- | --------------------- | --------------------- | ----- | --------- |
| View own profile    | ✅                    | ✅                    | ✅    | ❌        |
| View other profiles | ✅ (active)           | ✅ (all)              | ✅    | ❌        |
| Update own profile  | ✅                    | ✅                    | ✅    | ❌        |
| Update role         | ❌                    | ❌                    | ✅    | ❌        |
| View own matters    | ✅                    | ✅ (assigned)         | ✅    | ❌        |
| Create matters      | ❌                    | ❌                    | ✅    | ❌        |
| Upload documents    | ✅ (own matter)       | ✅ (assigned)         | ✅    | ❌        |
| Download documents  | ✅ (per access_level) | ✅ (per access_level) | ✅    | ❌        |
| Submit inquiry      | ✅                    | ✅                    | ✅    | ✅        |
| View inquiries      | ✅ (own)              | ✅ (all)              | ✅    | ❌        |
| View audit logs     | ✅ (own)              | ✅ (own)              | ✅    | ❌        |

### Penetration Testing

- [ ] Attempt to access `/admin` as client → 403/redirect
- [ ] Attempt to access `/admin` as lawyer → 403/redirect
- [ ] Attempt to update another user's profile → 403
- [ ] Attempt to change own role → 403
- [ ] Attempt to access matter not assigned → 403
- [ ] Attempt to download document without access → 403
- [ ] Attempt SQL injection in forms → blocked
- [ ] Attempt XSS in inquiry/consultation forms → sanitized

### Storage Security

- [ ] Private bucket `documents` not publicly accessible
- [ ] Public bucket `lawyer-photos` accessible
- [ ] Upload requires authenticated user
- [ ] Upload validates matter ownership
- [ ] Download validates access_level

---

## 📊 Monitoring & Observability

### 1. Supabase Logs

- [ ] Enable **Database Logs** in Dashboard
- [ ] Enable **Auth Logs** in Dashboard
- [ ] Enable **Edge Function Logs** in Dashboard
- [ ] Enable **Storage Logs** in Dashboard
- [ ] Set up **Log Drain** to external service (Datadog, Logtail, etc.)

### 2. Alerts (Dashboard → Settings → Alerts)

- [ ] High error rate on API
- [ ] High error rate on Auth
- [ ] High error rate on Storage
- [ ] Edge Function failures
- [ ] Database CPU > 80%
- [ ] Database connections > 80%
- [ ] Storage usage > 80%

### 3. Custom Metrics

- [ ] Daily active users
- [ ] Inquiries submitted
- [ ] Consultations booked
- [ ] Documents uploaded
- [ ] Failed login attempts

---

## 🚀 Go-Live Steps

### 1. Final Verification

- [ ] All tests pass
- [ ] No console errors in browser
- [ ] No network errors in DevTools
- [ ] Performance acceptable (LCP < 2.5s)
- [ ] Mobile responsive
- [ ] Accessibility score > 90

### 2. DNS Cutover

- [ ] Update DNS to point to Vercel/Netlify
- [ ] Verify SSL certificate issued
- [ ] Test HTTPS redirect
- [ ] Test www → non-www redirect (or vice versa)

### 3. Post-Launch (First 24 Hours)

- [ ] Monitor error rates
- [ ] Verify email delivery
- [ ] Test signup flow end-to-end
- [ ] Verify admin panel access
- [ ] Check audit logs for anomalies

### 4. Post-Launch (First Week)

- [ ] Daily log review
- [ ] Performance monitoring
- [ ] User feedback collection
- [ ] Backup verification

---

## 📦 Backup & Recovery

### 1. Database Backups

- [ ] Enable **Point-in-Time Recovery** (PITR) in Supabase
- [ ] Schedule daily logical backups (`pg_dump`)
- [ ] Test restore procedure monthly

### 2. Storage Backups

- [ ] Enable bucket versioning (if available)
- [ ] Sync critical documents to external storage

### 3. Code Backups

- [ ] Repository on GitHub/GitLab (primary)
- [ ] Mirror to secondary git host

---

## 📞 Emergency Contacts

| Role             | Name | Contact | Escalation |
| ---------------- | ---- | ------- | ---------- |
| Technical Lead   |      |         | 1st        |
| Supabase Admin   |      |         | 2nd        |
| Security Officer |      |         | 3rd        |
| Legal/Compliance |      |         | 4th        |

---

## ✅ Sign-Off

| Role            | Name | Signature | Date |
| --------------- | ---- | --------- | ---- |
| Developer       |      |           |      |
| Tech Lead       |      |           |      |
| Security Review |      |           |      |
| Product Owner   |      |           |      |

---

## 📚 Reference Documents

- `supabase/README.md` - Full schema documentation
- `supabase/SECURITY_AUDIT.md` - Security vulnerability analysis
- `supabase/SCHEMA_COMPARISON.md` - Old vs new schema
- `supabase/PRODUCTION_DEPLOYMENT.md` - Detailed deployment guide
- `README.md` - Project overview and setup
- `VERIFY_DEPLOYMENT.sql` - Automated verification script

---

**Remember**: Security is not a one-time setup. Schedule quarterly security reviews and keep dependencies updated.
