# Westwood Law Firm — User Acceptance Test Plan

| | |
|---|---|
| **Document** | UAT-WLF-001 |
| **Version** | 1.0 |
| **Date** | 2026-10-22 |
| **System** | Westwood Law Firm website + client/lawyer/admin portals |
| **Build under test** | `feature/realtime` @ `72e411f` (hero refactor `4b61a93` included) |
| **Database** | Supabase project `labwmffshjaywmattmen` — migrations through `20261027_three_role_model.sql` applied |
| **Prepared by** | Engineering |
| **Approver** | Firm owner |

---

## 1. Purpose and scope

This plan verifies that the system, as deployed, does what the firm needs it to do: take enquiries, book consultations, run matters, hold documents securely, and let one admin run the practice. It is written for a non-technical tester — every case is a click-path with a stated expected result.

**In scope**

- Public site: home, about, practice areas, lawyers, partner network, insights, law library, contact, inquiry, consultation.
- Authentication: registration, email verification, sign-in, sign-out, password reset, session handling.
- Three portals: client, lawyer, admin.
- Data protection: role separation, document access levels, break-glass, audit trail.
- Cross-cutting: realtime updates, light/dark theme, responsive layout, error handling.

**Out of scope**

- Load and stress testing beyond the smoke checks in §9.
- Email deliverability (covered separately — see §6.9).
- Payment processing (none exists).
- Infrastructure hardening, backup/restore drills.

---

## 2. Test environment and access

| Item | Value |
|---|---|
| Production URL | https://westwood-law-firm.vercel.app |
| Local dev URL | http://localhost:5173 (`npm run dev`) |
| Database | Supabase `labwmffshjaywmattmen` (production) |
| Browser baseline | Chrome or Edge, latest; one pass on Safari and one mobile device |

> **This is the live database.** There is no staging environment. Every case must be run with data prefixed `UAT-` and cleaned up afterwards (§10). Do not delete or edit real client records.

### 2.1 Test accounts

Passwords are **not** recorded in this document or in the repository. Obtain them from the credential note issued with this plan, or reset via **Forgot password**.

| Email | Role | Use for |
|---|---|---|
| `admin123@gmail.com` | admin | Modules G, H, and admin steps in C–F |
| `atty.boyet@westwoodlaw.ph` | lawyer | Modules F, H |
| `flores.augosteras.gapasin@gmail.com` | lawyer | Second lawyer — four-eyes review, team assignment |
| `fmaimun16@gmail.com` | client | Modules E, H |
| `ryandomer566@gmail.com` | client | Second client — cross-client isolation checks |

You will also need two throwaway addresses for B-01 and B-02 (any mailbox you control).

### 2.2 Role capability matrix

Use this to judge whether a visible control is correct.

| Capability | Client | Lawyer | Admin |
|---|:--:|:--:|:--:|
| Own matters, own documents, own appointments | ✅ | — | — |
| Assigned matters and their documents | — | ✅ | ✅ (all matters) |
| Upload documents | — | ✅ | ❌ view-only |
| Open Confidential document content | ❌ | ❌ (author only) | ✅ via break-glass + reason |
| Inquiry queue | own threads | ✅ | ✅ |
| Convert inquiry to matter | ❌ | ❌ | ✅ |
| Tasks and four-eyes review | ❌ | ✅ | ✅ |
| User accounts | ❌ | ❌ | ✅ |
| Website content, reports | ❌ | ❌ | ✅ |
| Audit trail | own rows | own rows | all rows |

Only three roles exist: `client`, `lawyer`, `admin`. Any screen offering a fourth role is a defect.

---

## 3. Entry criteria

1. The build in §0 is deployed and the deployment finished successfully.
2. Migrations through `20261027` are applied; the admin portal shows **User Accounts** with five accounts.
3. The five test accounts can sign in.
4. The tester has the credential note and two spare email addresses.

## 4. Exit criteria

- Every **P1** and **P2** case passes.
- No open Severity 1 or Severity 2 defect.
- All Severity 3 defects have an agreed workaround or a deferral signed by the owner.
- §10 cleanup is complete.

---

## 5. How to record results

Copy the tables into your tracker, or fill the **Result** column in place (`P` = pass, `F` = fail, `N/A` = not applicable, `B` = blocked). For every `F`, raise a defect with the case ID, what you saw, what you expected, the account used, browser, and a screenshot.

### 5.1 Severity

| Severity | Definition | Example |
|---|---|---|
| **S1 — Blocker** | Data loss, data exposure across clients, or the firm cannot operate | A client opens another client's document |
| **S2 — Critical** | A core workflow cannot complete | Inquiry submits but never reaches the admin queue |
| **S3 — Major** | Workflow completes but incorrectly, or needs a workaround | Task review approval does not move the task to Completed |
| **S4 — Minor** | Cosmetic, copy, spacing, or a low-traffic edge case | Label says "Profile" where the spec says "My Profile" |

### 5.2 Priority

**P1** must pass before go-live · **P2** should pass before go-live · **P3** can ship with a known issue.

---

## 6. Test cases

### 6.1 Module A — Public site and navigation

| ID | Pri | Scenario | Steps | Expected result | Result | Notes |
|---|---|---|---|---|---|---|
| A-01 | P1 | Hero fits a 1366×768 laptop | Open `/` at 100% zoom in a 1366×768 window | Badge, headline, body, both CTAs and the four metrics are all visible without scrolling; nothing is clipped; no horizontal scrollbar | | |
| A-02 | P1 | Hero on 1920×1080 | Open `/` at 100% zoom | Hero is vertically centred with clear headroom above and below; headline measures roughly 56–72 px, not full-width | | |
| A-03 | P2 | Hero on 2560×1440 | Open `/` at 100% zoom | Content stays in a centred column; text does not stretch edge to edge or look undersized | | |
| A-04 | P1 | Hero on mobile | Open `/` at 390×844 | No horizontal scroll; headline wraps without clipping; CTA buttons stack and are tappable; the mobile action bar does not cover any text | | |
| A-05 | P1 | All navigation links resolve | Click Home, About, Practice Areas, Our Lawyers, Partner Network, Insights, Law Library, Contact | Each opens its page with the correct heading; the active item is marked in the nav | | |
| A-06 | P1 | Deep link and refresh | Open each of the eight pages by pasting its URL, then press F5 | The same page reloads; you are not dropped on Home | | |
| A-07 | P2 | Browser back and forward | Navigate Home → About → Practice Areas, then Back twice, then Forward twice | History matches what you clicked; no blank page | | |
| A-08 | P2 | Unknown URL | Open `/this-does-not-exist` | Branded 404 page with a link back to Home; no stack trace | | |
| A-09 | P1 | Footer details | Scroll to the footer on any page | Address, phone and `firmwestwoodlaw@gmail.com` are correct and the email opens a mail client | | |
| A-10 | P2 | Contact is reachable only from the nav | Visit every public page and look for a "Contact Us" button or card | No Contact Us CTA exists outside the navigation menu (accepted design, see §8) | | |
| A-11 | P1 | Practice areas | Open Practice Areas | Twelve fields render with icons and copy; each opens its detail view and its "consult" action starts the consultation flow with that area preselected | | |
| A-12 | P1 | Lawyer directory | Open Our Lawyers | Exactly one lawyer — Atty. Ernesto "Boyet" Tabao — is listed; no demo associates; the photo is not distorted or cropped through the face | | |
| A-13 | P2 | Partner network | Open Partner Network | Page renders with its specialist content; no broken images or empty sections | | |
| A-14 | P2 | Insights and Law Library | Open Insights, then Law Library | Both render their content lists; articles open and read correctly; no dead links | | |
| A-15 | P2 | Light/dark theme | Toggle the theme in the header, visit three pages and both a client and admin portal, then reload | Default is light; the choice applies site-wide including portals; it survives reload; text and borders stay legible in both modes | | |
| A-16 | P3 | Content protection on public pages | Right-click on a public page; press F12 | The context menu is suppressed and devtools are deterred. The same actions inside `/portal` work normally (accepted design) | | |
| A-17 | P2 | Page metadata | View source or use a preview tool on each page | Each page has its own title and description; Home has Open Graph and structured data; no page shows a placeholder title | | |
| A-18 | P3 | Image loading | Load `/lawyers` and `/` on a throttled connection | Images fade in without the layout jumping; no oversized originals; no broken image icons | | |

### 6.2 Module B — Authentication and accounts

| ID | Pri | Scenario | Steps | Expected result | Result | Notes |
|---|---|---|---|---|---|---|
| B-01 | P1 | Register a new client | Open `/auth`, choose Register, enter a fresh email, name and a password of 8+ characters | Account is created, you land signed in as a client, and a verification banner appears | | |
| B-02 | P2 | Duplicate email | Register again with an email that already exists | Clear "already registered" message; no second account is created; no crash | | |
| B-03 | P2 | Weak password | Register with a 5-character password | Inline validation blocks submission and states the minimum length | | |
| B-04 | P1 | Email verification | Register, then click the link in the verification email | Banner clears, the account is confirmed, and a fresh sign-in works | | |
| B-05 | P1 | Client sign-in | Sign in as `fmaimun16@gmail.com` | Lands in the client portal with Dashboard, My Inquiries, My Matters, Appointments, Documents, Partner Network, Profile | | |
| B-06 | P1 | Admin sign-in | Sign in as `admin123@gmail.com` | Lands in the admin portal; the sidebar shows all 13 tabs including User Accounts, Client Intake, Website Content, Reports, Audit Logs | | |
| B-07 | P1 | Lawyer sign-in | Sign in as `atty.boyet@westwoodlaw.ph` | Lands in the lawyer portal with Dashboard, My Matters, Inquiries, Clients, Appointments, Documents, Tasks, Profile | | |
| B-08 | P2 | Wrong password | Sign in with a valid email and a wrong password | Generic "invalid credentials" message; it does not reveal whether the email exists | | |
| B-09 | P1 | Sign-out | Sign out from the portal | Session cleared, returned to the public site; opening `/portal` sends you to the auth page | | |
| B-10 | P1 | Password reset | Use Forgot password, open the emailed link, set a new password, sign in with it | Reset completes and the new password works; the old one no longer does | | |
| B-11 | P2 | Reset link reuse | Open the same reset link a second time | Link is rejected as expired or already used; no password change | | |
| B-12 | P2 | Session persistence | Sign in, reload, close the tab and reopen the site | You remain signed in; after a long idle period you are asked to sign in again rather than seeing an empty portal | | |
| B-13 | P2 | Deep link to the portal while signed out | Open `/portal` while signed out | Redirected to sign-in; after signing in you arrive at the portal, not the home page | | |
| B-14 | P2 | Account menu and profile | Open the account menu, then edit your name and phone | The header, menu and portal show the updated name immediately and after reload | | |

### 6.3 Module C — Public inquiry

| ID | Pri | Scenario | Steps | Expected result | Result | Notes |
|---|---|---|---|---|---|---|
| C-01 | P1 | Signed-out enquiry | Open `/inquiry` while signed out, complete name, email, phone, practice area, description, consent, and submit | Success screen with a reference number (e.g. `WI-2026-xxxx`); no error | | |
| C-02 | P2 | Required fields | Submit with the description and practice area empty | Submission blocked with field-level messages; nothing is written | | |
| C-03 | P1 | Practice area filters lawyers | Choose a practice area, then open the lawyer selector | Only lawyers practising that area are offered; changing the area clears an incompatible selection | | |
| C-04 | P1 | Attachment | Attach one PDF under the size limit and submit | Upload progress shown; the confirmation lists the attachment; the file appears on the inquiry in the admin portal | | |
| C-05 | P2 | Oversized attachment | Attach a file above the limit | Rejected before submission with a clear size message; the inquiry itself is not lost | | |
| C-06 | P2 | Registered client enquiry | Sign in as a client, open `/inquiry` | Name, email and phone are prefilled and read-only; the enquiry links to the existing account, not a new one | | |
| C-07 | P2 | Confirmation email | Submit an enquiry from a mailbox you control | Acknowledgement email arrives with the reference number; the firm address is notified | | |
| C-08 | P1 | Realtime arrival in the queue | Keep the admin portal open on Client Intake in one browser, submit an enquiry in another | The new row appears without refreshing, within a few seconds; the notification bell increments | | |
| C-09 | P2 | Reference number lookup | Quote the reference number on the success screen, then find it in the admin queue | The same reference is visible in the admin portal and in the client's My Inquiries | | |

### 6.4 Module D — Consultation booking

| ID | Pri | Scenario | Steps | Expected result | Result | Notes |
|---|---|---|---|---|---|---|
| D-01 | P1 | Complete the seven-step flow | Open `/consultation`, advance through all seven steps with valid input | Each step advances only when its input is valid; the final step confirms the booking | | |
| D-02 | P2 | Back navigation | Reach step 4, press Back twice, then forward again | Previously entered values are preserved; nothing is silently reset | | |
| D-03 | P2 | Past dates blocked | On the date step, try to pick yesterday | Past dates are unselectable or rejected with a message | | |
| D-04 | P1 | Confirmation | Finish a booking | Success screen shows date, time, mode and the lawyer or practice area chosen | | |
| D-05 | P1 | Appears for the client | Open the client portal, Appointments | The new booking is listed with the correct date and time | | |
| D-06 | P1 | Appears for the firm | Sign in as the lawyer and as the admin, open Appointments | The same booking is visible to both | | |
| D-07 | P2 | Double booking | Attempt to book the same lawyer at the same slot twice | Second attempt is refused or the slot is shown as taken | | |
| D-08 | P3 | Cancellation | Cancel the booking from the portal | Status changes for client and firm; a notification is produced | | |

### 6.5 Module E — Client portal

| ID | Pri | Scenario | Steps | Expected result | Result | Notes |
|---|---|---|---|---|---|---|
| E-01 | P1 | Dashboard accuracy | Sign in as `fmaimun16@gmail.com` | Stat cards match the records actually visible in the tabs (matters, appointments, documents, unread messages) | | |
| E-02 | P2 | Stat card drill-down | Click a dashboard stat card | It opens the matching tab with that filter applied; the filter is visible and clearable | | |
| E-03 | P1 | Inquiry thread | Open My Inquiries, then an enquiry | The thread shows the original message and every reply in order, with sender and timestamp | | |
| E-04 | P1 | Client replies | Send a reply in the thread | The message appears immediately; the admin sees it in the same thread without refreshing | | |
| E-05 | P1 | Matters scoping | Open My Matters, then a matter | Only the signed-in client's matters are listed; the detail shows status, team and timeline | | |
| E-06 | P1 | Documents | Open Documents, download a file you are entitled to | Only permitted access levels are listed; the download opens the correct file | | |
| E-07 | P1 | Confidential hidden | Look for a document marked Confidential on one of your matters | It does not appear at all in the client view | | |
| E-08 | P2 | Appointments | Open Appointments | Upcoming and past bookings are listed with correct statuses | | |
| E-09 | P3 | Partner network | Open Partner Network in the portal | Specialist list renders; no broken links | | |
| E-10 | P2 | Profile and avatar | Change name, phone and profile photo, then reload | Changes persist and appear in the header and on any staff-facing view | | |
| E-11 | P2 | Change password | Change the password from the profile, sign out, sign in with the new one | New password works; the old one is refused | | |
| E-12 | P2 | Notifications | Trigger an event (admin changes a matter status), watch the bell | Badge increments, the item is listed, opening it navigates to the right record, and it can be marked read | | |
| E-13 | P2 | Realtime matter status | With the client portal open, have the admin change a matter status | The client view updates without a manual refresh | | |

### 6.6 Module F — Lawyer portal

| ID | Pri | Scenario | Steps | Expected result | Result | Notes |
|---|---|---|---|---|---|---|
| F-01 | P1 | Scoped dashboard | Sign in as the lawyer | Dashboard counts and lists reflect only assigned matters, not the firm's whole caseload | | |
| F-02 | P1 | Matter access | Open My Matters | Assigned matters are listed; a matter you are not on is absent and cannot be opened by URL | | |
| F-03 | P1 | Inquiry queue | Open Inquiries | Enquiries routed to you or your practice areas are listed; opening one shows the full thread and attachments | | |
| F-04 | P2 | Clients | Open Clients | Only clients connected to your matters are listed | | |
| F-05 | P2 | Appointments | Open Appointments | Your consultations are listed with correct times | | |
| F-06 | P1 | Upload documents | On an assigned matter, upload one file at each level: Client & Assigned Lawyer, Staff Shared, Lawyer Only, Confidential | Each upload succeeds and the file is labelled with the chosen level | | |
| F-07 | P1 | Lawyer Only isolation | Sign in as the other lawyer and open the same matter | The Lawyer Only file is not visible to the non-assigned lawyer | | |
| F-08 | P1 | Create a task | Tasks, New task: title, assignee, due date, matter | Task is created and appears for the assignee | | |
| F-09 | P1 | Review gate | Create a task with "Requires review before completion", complete it as the assignee | Task moves to In Review, not Completed | | |
| F-10 | P1 | Approve a review | As the reviewer, approve with a comment | Task becomes Completed; the comment is stored and visible in the task history | | |
| F-11 | P1 | Reject a review | As the reviewer, reject with a comment | Task returns to In Progress with the rejection comment shown to the assignee | | |
| F-12 | P1 | Four-eyes rule | As the assignee, try to review your own task | The action is unavailable or refused; a task cannot be self-approved | | |
| F-13 | P2 | Task realtime | With the assignee's task list open, change the status from another browser | The list updates without a refresh | | |

### 6.7 Module G — Admin portal

| ID | Pri | Scenario | Steps | Expected result | Result | Notes |
|---|---|---|---|---|---|---|
| G-01 | P1 | Dashboard | Sign in as `admin123@gmail.com` | Metrics match the underlying records; recent activity is populated; all 13 tabs are reachable | | |
| G-02 | P1 | Account list | Open User Accounts | Exactly the five live accounts, each with the correct role badge (admin, lawyer, lawyer, client, client) | | |
| G-03 | P1 | Create a client | Create a client account with a password you set | Account is created, is active, and can sign in immediately | | |
| G-04 | P1 | Create a lawyer | Create a lawyer account | Temporary password is generated and emailed; the password is never displayed in the UI | | |
| G-05 | P2 | Change a role | Change a client to lawyer, then back | Role updates, the badge changes, and the user's next sign-in lands in the correct portal | | |
| G-06 | P2 | Deactivate | Deactivate a test account, then try to sign in as it | Sign-in is refused; the account remains listed as inactive | | |
| G-07 | P2 | Delete | Delete a test account | Removed from the list; sign-in refused; no orphaned records or errors | | |
| G-08 | P1 | Last-admin guard | Try to demote or deactivate the only active admin | Blocked with a plain-language explanation; the account stays admin | | |
| G-09 | P1 | Intake queue | Open Client Intake, change an enquiry's status through its options | Status updates, persists after reload, and is reflected on the client side | | |
| G-10 | P1 | Convert to matter | Convert a test enquiry into a matter, choosing practice area and lawyer | Matter is created with a matter number, linked to the client, and appears in Matters, the client's My Matters and the lawyer's list | | |
| G-11 | P1 | Matter management | Create a matter, change its status, edit its details | Every change saves, survives reload, and notifies the client and team | | |
| G-12 | P2 | Matter team | Add a lawyer to a matter team, then try to add a client | Lawyer is added; a client cannot be added to a team | | |
| G-13 | P2 | Tasks oversight | Open Tasks | All firm tasks are visible with assignee, matter, due date and status | | |
| G-14 | P2 | Appointments oversight | Open Appointments | All bookings are visible and filterable | | |
| G-15 | P2 | Lawyer directory | Edit the lawyer's profile or photo in Lawyers, then open the public Our Lawyers page | The public page reflects the change | | |
| G-16 | P1 | Document oversight | Open Documents | All documents including Confidential are listed with metadata; there is no upload control for the admin | | |
| G-17 | P1 | Break-glass | Open a Confidential document, supply a reason, confirm | Content opens only after a reason is entered; the access is recorded in Audit Logs with the reason and timestamp | | |
| G-18 | P1 | Break-glass refusal | Attempt to open a Confidential document with an empty reason | Refused with a validation message; nothing is opened or logged | | |
| G-19 | P2 | Website content | Edit a headline or article in Website Content and save, then open the public page | The public page shows the change without a redeploy; a second browser updates live | | |
| G-20 | P2 | Reports | Open Reports, then export | Figures match the records; the exported file opens in a spreadsheet with correct columns and no broken characters | | |
| G-21 | P3 | System settings | Open System Settings | Read-only reference values render; nothing here is editable or misleading | | |
| G-22 | P1 | Audit trail | Open Audit Logs after performing G-05, G-10 and G-17 | Each action appears with actor, action, target and timestamp; filters work; entries cannot be edited or deleted from the UI | | |
| G-23 | P2 | Admin profile | Edit the admin's own name and photo | Persists and shows in the header | | |

### 6.8 Module H — Security and data isolation

These are the cases that matter most. Run them with two browsers signed in as different users. Where a step says "via the API", use the browser devtools console against the Supabase REST endpoint with the signed-in session token.

| ID | Pri | Scenario | Steps | Expected result | Result | Notes |
|---|---|---|---|---|---|---|
| H-01 | P1 | Cross-client matter access | As client A, request client B's matter ID via the REST API | No rows returned; no error that leaks the record's existence | | |
| H-02 | P1 | Cross-client document access | As client A, request a document belonging to client B | No rows and no download URL | | |
| H-03 | P1 | Unassigned matter | As a lawyer, request a matter you are not on | No rows returned | | |
| H-04 | P1 | Role escalation | As a client, attempt to update your own `profiles.role` to admin | Refused; the role is unchanged | | |
| H-05 | P1 | Anonymous access | Signed out, request `profiles`, `matters`, `documents`, `inquiries` | All refused or empty | | |
| H-06 | P1 | Admin cannot upload | As the admin, attempt a document insert via the API | Refused by the database; the UI also offers no upload control | | |
| H-07 | P1 | Confidential content blocked | As a lawyer not on the matter, or as the admin without break-glass, request the file | Metadata may be visible; the content is not | | |
| H-08 | P1 | Break-glass without reason | Call the break-glass function with an empty reason | Refused | | |
| H-09 | P2 | Deactivated account | Sign in as a deactivated account | Refused | | |
| H-10 | P2 | Edge function authorisation | Call `admin-create-user` and `admin-delete-user` with a client or lawyer token | 403; no account is created or deleted | | |
| H-11 | P2 | Storage isolation | Take a file URL from client A's session and open it as client B | Refused | | |
| H-12 | P2 | Injection and escaping | Submit `<script>alert(1)</script>` and `'; DROP TABLE` in the enquiry name and description | Text is stored and displayed literally; no script runs; no table is dropped | | |
| H-13 | P2 | Audit immutability | Try to update or delete an audit row from the API | Refused | | |

### 6.9 Module I — Cross-cutting and non-functional

| ID | Pri | Scenario | Steps | Expected result | Result | Notes |
|---|---|---|---|---|---|---|
| I-01 | P1 | Realtime, two browsers | Admin in browser A, client in browser B; submit an enquiry, send a message, change a matter status | Each change appears in B within a few seconds with no refresh | | |
| I-02 | P2 | Dark mode contrast | Switch to dark mode and visit Home, Practice Areas, and all three portals | No unreadable text, no white cards on a dark background, no invisible borders | | |
| I-03 | P2 | Keyboard only | Tab through the header, a form, and the portal sidebar | Focus is always visible; every control is reachable; Escape closes dialogs; focus returns to the trigger | | |
| I-04 | P2 | Mobile portal | Open the client portal at 390×844 | Sidebar becomes a drawer; content is readable; the bottom bar does not cover the last row | | |
| I-05 | P3 | Error handling | Force a render error on a test page | A branded fallback appears with a way back; the rest of the app still works | | |
| I-06 | P2 | Empty states | Sign in as a brand-new client with no data | Each tab explains what will appear here; no blank panels, no `undefined`, no zero-division artefacts | | |
| I-07 | P3 | Slow network | Throttle to Fast 3G and load the portal | Loading indicators appear; the UI does not flash empty then pop in | | |
| I-08 | P2 | Browser and device matrix | Repeat A-01, B-05, E-05 and F-06 on Safari, Firefox, and one iOS and one Android device | Behaviour matches Chrome; no layout breakage | | |
| I-09 | P3 | Print and PDF | Print a matter detail page | Content is legible; navigation and buttons are not printed | | |
| I-10 | P3 | Long content | Create a matter with a 200-character title and a long description | Text wraps; tables do not overflow horizontally; no clipped buttons | | |

---

## 7. Defect log template

| Field | Value |
|---|---|
| Defect ID | |
| UAT case ID | |
| Severity / Priority | |
| Account and role | |
| Browser and viewport | |
| Steps to reproduce | |
| Expected | |
| Actual | |
| Evidence | (screenshot or screen recording) |
| Workaround | |

---

## 8. Accepted behaviour — do not log as defects

These are deliberate product decisions. A tester unfamiliar with them will report them as bugs; they are not.

1. **No "Contact Us" CTA anywhere except the navigation.** Removed at the owner's request; the contact form is reached only through the nav.
2. **The admin cannot upload documents.** View-only by design; the database refuses it.
3. **Admins see Confidential document metadata but not content** until they break-glass with a written reason, which is audited.
4. **Right-click and devtools are deterred on public pages only.** The portal is exempt so staff can work.
5. **Exactly one lawyer is in the public directory.** The six demo associates were deleted; the firm lists its real lawyer.
6. **Only three roles exist.** No intake, paralegal, system administrator or managing partner.
7. **No bulk texting.** Outbound SMS is handled by an external tool.
8. **Inquiry messages are encrypted at rest.** They are readable in the UI; they are not expected to be readable in the database console.
9. **Website content is editable from the admin portal** and goes live without a redeploy.

---

## 9. Smoke test (run after every deploy, 10 minutes)

1. Home loads and the hero fits a 1366×768 viewport.
2. Sign in as each of the three roles; the correct portal and tab set appear.
3. Submit one enquiry; it reaches the admin queue in under ten seconds.
4. Book one consultation; it appears in all three portals.
5. Upload one document as the lawyer; download it as the client.
6. Open Audit Logs; the actions above are present.
7. Sign out; `/portal` redirects to sign-in.

---

## 10. Cleanup after testing

1. Delete every account created for B-01, B-02, G-03, G-04, G-06 and G-07.
2. Delete matters and tasks whose titles begin with `UAT-`.
3. Delete test documents and their storage objects.
4. Cancel test consultations so they do not appear as real bookings.
5. Leave the audit trail alone — it is append-only and should retain the record of what was tested.
6. Confirm User Accounts is back to the five live accounts.

---

## 11. Sign-off

| Role | Name | Decision | Date |
|---|---|---|---|
| Tester | | ☐ Accepted ☐ Accepted with defects ☐ Rejected | |
| Firm owner | | ☐ Accepted ☐ Accepted with defects ☐ Rejected | |

**Conditions or notes:**

---

*End of UAT-WLF-001.*
