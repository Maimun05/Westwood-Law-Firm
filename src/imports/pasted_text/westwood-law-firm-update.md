Update the current Westwood Law Firm website and management system based on the existing design. This is a FRONTEND DEMO/PROTOTYPE for a school IT project, so do NOT build or require a real backend, database, Supabase authentication, API, email service, or production security. Simulate the functionality using mock data and frontend state.

Do not redesign the entire website. Preserve the existing Westwood logo, branding, colors, typography, spacing, animations, lawyer profiles, and overall professional law-firm aesthetic.

## 1. MAIN NAVIGATION

Use this public navigation:

- Home
- About
- Practice Areas
- Our Lawyers
- Partner Network
- Insights & Resources
- Contact
- Sign In

Use a prominent primary button:

"Start a Legal Inquiry"

Rename:

- Expertise → Practice Areas
- Specialists → Partner Network

Merge:

- Insights + Resources → Insights & Resources

Do not create unnecessary duplicate navigation items.

---

## 2. START A LEGAL INQUIRY

Create one main public intake feature called:

"Start a Legal Inquiry"

This must NOT require sign-in.

Allow visitors to submit a simple inquiry using a polished multi-step or well-organized form.

Fields:

- Full Name
- Email
- Phone Number
- Inquiry Type
- Practice Area
- Preferred Lawyer, optional
- Brief Description
- Preferred Contact Method
- Optional Attachment

Inquiry types:

- I need legal advice
- I want to hire a lawyer
- I have an existing legal matter
- I have a general question
- I want to contact a specific lawyer

After submission, show a professional confirmation page:

"Your legal inquiry has been submitted successfully."

Generate a realistic mock reference number such as:

"WI-2026-00124"

Add:

"Westwood Law Firm will review your inquiry and contact you through email."

This is only simulated frontend behavior.

---

## 3. CONTACT PAGE

Keep the Contact page, but do NOT use it as another inquiry form.

Use it for:

- Firm address
- Phone
- Email
- Office hours
- Map/location
- General firm information

The actual inquiry form should only exist under:

"Start a Legal Inquiry"

This avoids duplicate contact systems.

---

## 4. CONSULTATION SCHEDULING

Keep the consultation feature, but make the demo behave as though sign-in is required.

When a visitor clicks:

"Schedule a Consultation"

show a sign-in requirement before allowing the booking process.

Example:

"Please sign in or create an account to schedule a consultation."

Buttons:

- Sign In
- Create Account
- Back

After the user chooses a demo client account, continue to the consultation flow.

This is SIMULATED authentication. Do not connect it to Supabase Auth.

The consultation flow should include:

1. Practice Area
2. Type of Assistance
3. Select Lawyer or Get Recommendation
4. Consultation Method
5. Date and Time
6. Client Information
7. Review and Confirm

After confirmation, show:

"Consultation Request Submitted"

Include:

- Reference Number
- Lawyer
- Practice Area
- Date
- Time
- Consultation Method
- Status: Pending Review

Also include a button:

"Go to Client Portal"

---

## 5. SIGN IN / DEMO AUTHENTICATION

Keep a polished Sign In page.

This is a demo only.

Do NOT implement real authentication.

Instead, simulate login with demo accounts.

Provide clearly labeled demo choices such as:

### Client Demo

Access:

- Client Portal

### Lawyer Demo

Access:

- Lawyer Portal

### Staff/Admin Demo

Access:

- Staff/Admin Portal

The interface should look like a real authentication system even though the role selection is simulated.

Do not display technical wording such as "frontend-only mockup" to the user.

Use realistic sample credentials or demo account buttons.

---

## 6. REMOVE GENERAL MESSAGING

Remove the separate:

"Message Lawyer"

feature from the client-facing website.

Remove:

- Message Lawyer buttons
- General lawyer chat
- Direct client-to-lawyer messaging
- Separate client inbox for casual messages
- Message Modal UI

Do not replace it with another chat feature.

The system should use:

Legal Inquiry → Email communication

For existing clients, use:

Client Portal → Matter Updates + Notifications + Documents + Appointments

This should make the system feel more organized and professional.

---

## 7. CLIENT PORTAL

Create a clean Client Portal with:

- Dashboard
- My Matters
- Appointments
- Documents
- Notifications
- Profile

### Client Dashboard

Display realistic mock information such as:

Active Matters
Upcoming Consultation
Pending Documents
Recent Activity
Notifications

Example:

Matter:
"Employment Dispute"
Status: Active
Assigned Lawyer: Atty. Maria Santos

Appointment:
"Initial Legal Consultation"
September 20, 2026
2:00 PM
Online Consultation

---

## 8. MATTER MANAGEMENT

Make Matter Management the central feature of the entire system.

A Matter represents a client's legal case or legal concern.

Create a realistic Matter Management interface.

Each matter should display:

- Matter Number
- Client
- Practice Area
- Assigned Lawyer
- Matter Status
- Priority
- Date Opened
- Description

Use this workflow:

New Inquiry
→ Under Review
→ Consultation
→ Conflict Check
→ Accepted
→ Active
→ Resolved
→ Closed

Use professional status badges and progress indicators.

---

## 9. MATTER DETAILS PAGE

When a matter is opened, show tabs or sections:

### Overview

Matter information and current status.

### Client

Client details.

### Assigned Lawyer

Lawyer profile and contact information.

### Appointments

Upcoming and completed appointments.

### Documents

Documents related to the matter.

### Activity

Chronological matter timeline.

### Status

Current status and progress.

Use realistic mock data.

---

## 10. ACTIVITY TIMELINE

Add a chronological timeline for each matter.

Example entries:

- Legal inquiry submitted
- Inquiry reviewed
- Consultation scheduled
- Lawyer assigned
- Conflict check completed
- Consultation completed
- Document uploaded
- Matter accepted
- Matter status changed
- Matter resolved
- Matter closed

Use dates and timestamps.

This should visually demonstrate the progression of a legal matter.

---

## 11. CONFLICT CHECK

Add a simulated Conflict Check feature for Staff/Lawyer users.

Workflow:

Search Client/Party Name
→ Possible Matching Record
→ Review
→ Clear / Further Review

If a possible conflict is found, show:

"Potential conflict detected. Further review required."

The demo should NOT automatically determine that a legal conflict exists.

Use realistic sample records.

---

## 12. LAWYER ASSIGNMENT

Add a Staff/Admin feature for assigning lawyers to matters.

Allow the demo user to:

- View unassigned matters
- View available lawyers
- Assign a lawyer
- Reassign a lawyer

Use mock data and frontend interactions.

Show lawyer workload or current assigned matters where appropriate.

---

## 13. DOCUMENT MANAGEMENT

Add a Documents section within each matter.

Display:

- Document Name
- Document Type
- Uploaded By
- Upload Date
- Status
- Version

Examples:

- Valid ID
- Employment Contract
- Complaint Affidavit
- Supporting Evidence
- Legal Notice

Allow the demo user to simulate:

- Upload Document
- View Document
- Download Document
- Replace Version

These actions can be simulated with frontend dialogs or status changes.

---

## 14. LAWYER PORTAL

Create a separate Lawyer Portal.

Sections:

- Dashboard
- My Matters
- Clients
- Appointments
- Documents
- Partner Referrals
- Profile

Dashboard should show:

- Active Matters
- Upcoming Appointments
- Pending Documents
- Recent Matters
- Workload Summary

A lawyer should be able to open a matter and view its details, timeline, documents, client information, and appointments.

---

## 15. STAFF/ADMIN PORTAL

Create a separate Staff/Admin Portal.

Sections:

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

Use a professional administrative dashboard.

---

## 16. DASHBOARD REPORTS

Add mock analytics for Staff/Admin.

Display:

- Total Inquiries
- Pending Inquiries
- Scheduled Consultations
- Active Matters
- Closed Matters
- Matters by Practice Area
- Lawyer Workload
- Pending Conflict Checks

Use visually clean charts, graphs, and summary cards.

All data can be mock data.

---

## 17. AUDIT LOGS

Add a simulated Audit Logs page for Staff/Admin.

Display activities such as:

- User signed in
- Matter created
- Lawyer assigned
- Status changed
- Document uploaded
- Appointment updated
- Conflict check completed

Each item should include:

- User
- Action
- Module
- Date
- Time

This is only a demo interface.

---

## 18. FIND MY LAWYER

Keep the existing "Find My Lawyer" functionality.

Do not make it a separate main navigation item.

Place it prominently within:

"Our Lawyers"

Use the existing questionnaire:

1. Practice Area
2. Individual or Business
3. Type of Assistance
4. Consultation Preference

Then show recommended lawyers using mock matching logic.

Allow the user to choose:

"Schedule Consultation"

which then triggers the sign-in requirement.

---

## 19. PARTNER NETWORK

Keep the Partner Network because it is an important innovative feature.

Show external professional specialists such as:

- Financial & Tax Experts
- Technical & Industry Experts
- Business Consultants
- Other Professional Specialists

Show:

- Specialist profile
- Expertise
- Industry
- Related practice areas
- Related Westwood lawyers

For Staff/Lawyer users, include:

"Create Partner Referral"

This can be simulated.

---

## 20. INSIGHTS & RESOURCES

Combine Insights and Resources into:

"Insights & Resources"

Organize it into:

- Legal Insights
- Legal Updates
- Guides
- FAQs
- Seminars & Events
- Business Resources

Keep the existing articles and resource content where possible.

---

## 21. RETAINER PACKAGES

Move Retainer Packages out of Resources.

Present them as a legal service offering under an appropriate Services or Business Legal Services section.

Keep the existing design style.

---

## 22. REMOVE SAVED LAWYERS FROM THE MAIN WORKFLOW

Saved Lawyers may remain as a secondary feature if it already works visually.

Do not give it a major navigation position.

The main user journey should focus on:

Inquiry
→ Consultation
→ Matter
→ Documents
→ Appointments
→ Resolution

---

## 23. IMPORTANT DEMO BEHAVIOR

Use frontend state, mock data, dialogs, and simulated actions to make the system FEEL functional.

Examples:

- Signing in changes the visible portal
- Submitting an inquiry generates a reference number
- Scheduling a consultation creates a mock appointment
- Assigning a lawyer updates the matter
- Changing matter status updates the status indicator
- Uploading a document adds it to the list
- Completing a conflict check updates the matter timeline
- Dashboard numbers update when appropriate

No real backend is required.

---

## 24. OVERALL USER JOURNEY

### Visitor

Home
→ Practice Areas / Our Lawyers
→ Find My Lawyer
→ Start a Legal Inquiry

### Consultation

Select Lawyer
→ Schedule Consultation
→ Sign In / Demo Client
→ Complete Booking
→ Confirmation
→ Client Portal

### Legal Matter

Inquiry
→ Under Review
→ Consultation
→ Conflict Check
→ Accepted
→ Lawyer Assigned
→ Active Matter
→ Documents / Appointments / Activity
→ Resolved
→ Closed

---

## 25. FINAL DESIGN GOAL

The final product should feel like:

"A modern law firm website combined with a legal practice management system."

Prioritize:

- Professional appearance
- Simple navigation
- Clear user journeys
- Consistent components
- Strong visual hierarchy
- Realistic mock data
- Interactive demo behavior
- Matter Management as the central feature

Do not add unnecessary features.

Do not build a real backend.

Do not connect Supabase authentication.

Do not redesign the website from scratch.

Focus on making the current prototype polished, coherent, interactive, and presentation-ready.
