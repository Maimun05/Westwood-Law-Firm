Update the current Westwood Law Firm website and client management system. Keep the existing visual design, branding, logo, colors, typography, and overall professional law-firm aesthetic unless a change below requires a UI adjustment.

## 1. RESTRUCTURE THE MAIN NAVIGATION

Change the public navigation to:

- Home
- About
- Practice Areas
- Our Lawyers
- Partner Network
- Insights & Resources
- Contact
- Sign In
- Primary CTA: Start a Legal Inquiry

Rename:

- "Expertise" → "Practice Areas"

Merge:

- "Insights" and "Resources" → "Insights & Resources"

Remove duplicate or competing navigation items.

The main user journey should focus on:

Start a Legal Inquiry → Initial Review → Consultation → Conflict Check → Matter → Case Management

---

## 2. CONSOLIDATE ALL CLIENT CONTACT FEATURES

Remove the separate competing communication paths:

- Separate Contact inquiry system
- Separate Message Lawyer system
- Separate general consultation communication

Replace them with one main feature:

### "Start a Legal Inquiry"

The user should be able to choose:

- I need legal advice
- I want to hire a lawyer
- I have an existing matter
- I have a general question
- I want to contact a specific lawyer

The inquiry form should collect:

- Full Name
- Email
- Phone Number
- Inquiry Type
- Practice Area
- Brief Description
- Optional Attachment
- Preferred Contact Method

After submission, generate an inquiry reference number.

Example:

"Your legal inquiry has been submitted successfully."
"Reference No. WI-2026-00124"

The firm can respond through email.

Do not require an account for simple inquiries.

---

## 3. REQUIRE SIGN-IN FOR CONSULTATION SCHEDULING

A visitor should be allowed to browse the website, lawyers, and practice areas without signing in.

However, scheduling a consultation must require the user to sign in or create an account.

Flow:

Browse → Select Practice Area/Lawyer → Schedule Consultation → Sign In/Register → Select Date & Time → Confirm → Consultation Created

If the user is not signed in, display:

"Please sign in or create an account to schedule a consultation."

After scheduling, the consultation must appear in the client's Client Portal.

---

## 4. REMOVE THE GENERAL CLIENT MESSAGING FEATURE

Remove the current "Message Lawyer" feature from the client-facing system.

Do not allow public users or clients to freely message individual lawyers.

Use email as the main external communication method for inquiries.

Do not create a separate lawyer chat system.

The Client Portal should instead focus on matter management, appointments, documents, notifications, and activity history.

---

## 5. CREATE A REAL CLIENT PORTAL

Separate the Client Portal from staff functions.

### Client Portal

Include:

- Dashboard
- My Matters
- Appointments
- Documents
- Notifications
- Profile

Do not show staff/admin functions inside the client portal.

### Client Dashboard

Show:

- Active Matters
- Upcoming Consultations
- Recent Documents
- Recent Activity
- Matter Status
- Notifications

---

## 6. ADD MATTER MANAGEMENT

Add a new major subsystem called:

### Matter Management

This should become the central feature of the internal system.

A matter represents a client's legal case or legal concern.

Each matter should contain:

- Matter Number
- Client
- Practice Area
- Assigned Lawyer
- Matter Status
- Date Opened
- Description
- Priority
- Related Appointments
- Related Documents
- Activity History

Matter status workflow:

New Inquiry
→ Under Review
→ Consultation
→ Conflict Check
→ Accepted
→ Active
→ Resolved
→ Closed

The system should allow authorized staff/lawyers to update the matter status.

---

## 7. ADD CONFLICT CHECKING

Before a matter can be accepted, add a Conflict Check process.

Workflow:

New Client/Party Name
→ Search Existing Matters/Clients
→ Potential Conflict Found?
→ Review by Authorized Staff/Lawyer
→ Clear / Further Review

The system should only flag possible matching names or related records.

Do not automatically determine whether a legal conflict exists. The final decision must be made by authorized staff or lawyers.

---

## 8. ADD LAWYER ASSIGNMENT

Add a feature for staff/admin to assign or reassign lawyers to matters.

Staff should be able to:

- View unassigned matters
- View available lawyers
- Assign a lawyer
- Reassign a lawyer
- View lawyer workload

The assigned lawyer should appear on the matter record and in the client's portal.

---

## 9. ADD DOCUMENT MANAGEMENT

Add a secure document management subsystem connected to each matter.

Documents should have:

- Document Name
- Document Type
- Matter
- Uploaded By
- Upload Date
- Version
- Status
- Access Permission

Allow clients to upload documents related to their matter.

Allow authorized lawyers/staff to view documents associated with their assigned matters.

Use Supabase Storage for actual document files.

---

## 10. ADD ACTIVITY TIMELINE

Every matter should have an activity timeline.

Example:

- Inquiry submitted
- Inquiry reviewed
- Consultation scheduled
- Lawyer assigned
- Conflict check completed
- Document uploaded
- Consultation completed
- Matter status changed
- Document reviewed
- Matter closed

Display this as a chronological timeline.

---

## 11. ADD ROLE-BASED PORTALS

Separate the system into role-based experiences.

### Client

- Dashboard
- My Matters
- Appointments
- Documents
- Notifications
- Profile

### Lawyer

- Dashboard
- My Matters
- Clients
- Appointments
- Documents
- Partner Referrals
- Profile

### Staff/Admin

- Dashboard
- Client Intake
- Matters
- Appointments
- Lawyers
- Partner Network
- Documents
- Reports
- Users
- Audit Logs

Do not mix Client, Lawyer, Staff, and Admin interfaces together.

---

## 12. ADD REAL AUTHENTICATION

Replace the current simulated/local sign-in behavior with proper Supabase Authentication.

Use:

- Supabase Auth
- Email/password authentication
- User profiles
- User roles

Roles:

- Client
- Lawyer
- Staff
- Admin

Use Supabase Row Level Security so users can only access records appropriate to their role.

Clients must not be able to access other clients' matters, documents, appointments, or personal information.

---

## 13. IMPROVE THE DATABASE STRUCTURE

Do not rely on the existing KV-store structure as the final database design.

Create proper Supabase PostgreSQL tables such as:

- profiles
- clients
- lawyers
- staff
- practice_areas
- matters
- inquiries
- consultations
- appointments
- documents
- specialist_partners
- referrals
- audit_logs

Use relationships and foreign keys between tables.

The KV store can remain temporarily for prototype compatibility, but the final implementation should use relational tables.

---

## 14. KEEP AND IMPROVE FIND MY LAWYER

Keep the "Find My Lawyer" feature, but do not make it a separate competing navigation destination.

Integrate it into:

### Our Lawyers

Add a prominent button:

"Find My Lawyer"

The questionnaire can remain:

1. Practice Area
2. Individual or Business
3. Type of Assistance
4. Consultation Preference

Then show recommended lawyers based on the responses.

---

## 15. KEEP THE PARTNER NETWORK

Keep the Specialist Partner Network because it is one of the system's innovative features.

Rename the public navigation label:

"Specialists" → "Partner Network"

Explain that the network consists of external professionals who may support legal matters.

Examples:

- Financial & Tax Experts
- Technical & Industry Experts
- Business Consultants
- Other Professional Specialists

Partner referrals should primarily be managed by authorized lawyers/staff.

Add a Partner Referral feature inside the Lawyer/Staff portal.

---

## 16. RESTRUCTURE INSIGHTS AND RESOURCES

Merge Insights and Resources into:

### Insights & Resources

Organize the section into:

- Legal Insights
- Legal Updates
- Guides
- FAQs
- Seminars & Events
- Business Resources

Do not duplicate Articles/Insights categories across multiple pages.

---

## 17. MOVE RETAINER PACKAGES

Move Retainer Packages out of Resources.

Place them under an appropriate services/business section such as:

"Business Legal Services"

or

"Services"

Retainer packages should be presented as legal service offerings, not general resources.

---

## 18. KEEP SEMINARS BUT MAKE THEM SECONDARY

Keep seminars and events, but treat them as part of Insights & Resources.

Do not make seminar registration a major part of the core legal workflow.

---

## 19. REMOVE SAVED LAWYERS FROM THE CORE WORKFLOW

Saved Lawyers may remain as an optional secondary feature.

Do not make it a major navigation item.

The primary system should focus on:

Inquiry
→ Consultation
→ Matter
→ Documents
→ Case Progress

---

## 20. ADD REPORTS AND DASHBOARD ANALYTICS

For authorized Staff/Admin users, add reports such as:

- Total Inquiries
- Pending Inquiries
- Consultations
- Active Matters
- Closed Matters
- Matters by Practice Area
- Lawyer Workload
- Pending Conflict Checks
- Document Activity

Use charts and summary cards where appropriate.

---

## 21. ADD AUDIT LOGS

Create an Audit Logs section for Staff/Admin.

Track important actions such as:

- Login
- Matter creation
- Matter status change
- Lawyer assignment
- Document upload
- Document access/download
- Appointment changes
- User/role changes

Each log should include:

- User
- Action
- Record/Module
- Date & Time

---

## 22. SIMPLIFY THE OVERALL CLIENT JOURNEY

The primary client journey should now be:

### New Visitor

Browse Website
↓
Practice Areas / Our Lawyers
↓
Find My Lawyer or Start a Legal Inquiry
↓
Submit Inquiry
↓
Firm Reviews Inquiry
↓
Client is invited to schedule consultation
↓
Client signs in/registers
↓
Consultation Scheduled
↓
Conflict Check
↓
Matter Accepted
↓
Lawyer Assigned
↓
Client Portal
↓
Documents / Appointments / Updates
↓
Matter Resolved
↓
Matter Closed

---

## 23. REMOVE UNNECESSARY DUPLICATION

Avoid having multiple features that perform the same purpose.

Remove or merge:

- Contact + Message Lawyer + Consultation communication
- Insights + Resources
- Separate Find Lawyer navigation page + Our Lawyers
- Public direct messaging to lawyers
- Multiple independent inquiry forms

The website should feel like one connected legal management system instead of a collection of separate features.

---

## 24. IMPORTANT DESIGN DIRECTION

Keep the existing professional law-firm visual design.

Do not redesign everything from scratch.

Prioritize:

- Clean layouts
- Professional typography
- Strong whitespace
- Clear hierarchy
- Simple navigation
- Consistent buttons
- Professional lawyer profiles
- Clear status indicators
- Secure and trustworthy appearance

The system should look like a modern law firm website combined with a legal practice management system.

The most important new feature should be Matter Management, not messaging or chat.

---

## 25. FINAL SYSTEM STRUCTURE

### Public Website

Home
About
Practice Areas
Our Lawyers
Partner Network
Insights & Resources
Contact
Sign In
Start a Legal Inquiry

### Client Portal

Dashboard
My Matters
Appointments
Documents
Notifications
Profile

### Lawyer Portal

Dashboard
My Matters
Clients
Appointments
Documents
Partner Referrals
Profile

### Staff/Admin Portal

Dashboard
Client Intake
Matters
Appointments
Lawyers
Partner Network
Documents
Reports
Users
Audit Logs

### Core Workflow

Legal Inquiry
→ Consultation
→ Conflict Check
→ Matter Creation
→ Lawyer Assignment
→ Active Matter
→ Documents & Appointments
→ Resolution
→ Closure
