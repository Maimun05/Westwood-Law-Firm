Update the existing Westwood Law Firm website and client portal to implement a realistic DEMO-ONLY account and role-based access system.

IMPORTANT:
This is a frontend school-project demonstration. Do NOT create or require a real backend, database, Supabase Auth, email verification, or real authentication.

Use mock accounts and frontend state/local storage to simulate the functionality.

Do not redesign the existing website. Keep the current Westwood branding, layout, colors, typography, navigation, and overall design.

==================================================

1. ACCOUNT TYPES
   ==================================================

Create three user roles:

1. CLIENT
2. LAWYER
3. ADMIN

The role determines what parts of the system the user can access.

The role must be stored with each dummy account.

================================================== 2. SIGN-IN PAGE
===============

Replace the current role-selection demo screen with a realistic Sign In page.

Display:

Welcome Back

Sign in to your Westwood Law Firm account.

Email
Password

[Sign In]

Forgot Password?

Don't have an account?
[Create Account]

Add a small "Demo Accounts" area below the login form so the project presenter can quickly access the different demo roles.

The user should NOT simply select a role to enter the portal.

Instead, selecting a demo account should automatically fill the appropriate credentials or sign the user in as that account.

================================================== 3. CREATE ACCOUNT MODAL
=======================

Add a "Create Account" button that opens a modal.

The modal should contain:

Full Name
Email Address
Password
Confirm Password
Phone Number

Account Type:
Client

IMPORTANT:
Public users can only create CLIENT accounts.

Do not allow visitors to create Lawyer or Admin accounts.

Display:

"Lawyer and Admin accounts are created and managed by Westwood Law Firm."

Buttons:

[Create Account]
[Cancel]

After successful registration, show:

"Account Created Successfully"

Then allow the user to sign in.

Since this is a demo, simulate account creation using frontend state/local storage.

================================================== 4. DUMMY ACCOUNTS
=================

Create the following demo accounts:

CLIENT:

Name:
Maria Santos

Email:
[maria.santos@demo.westwoodlaw.ph](mailto:maria.santos@demo.westwoodlaw.ph)

Role:
Client

---

CLIENT:

Name:
Juan Dela Cruz

Email:
[juan.delacruz@demo.westwoodlaw.ph](mailto:juan.delacruz@demo.westwoodlaw.ph)

Role:
Client

---

LAWYER:

Name:
Atty. Ernesto Tabao

Email:
[ernesto.tabao@demo.westwoodlaw.ph](mailto:ernesto.tabao@demo.westwoodlaw.ph)

Role:
Lawyer

Position:
Managing Partner

Use the existing Atty. Ernesto Tabao profile and photographs.

---

LAWYER:

Name:
Atty. Ana Reyes

Email:
[ana.reyes@demo.westwoodlaw.ph](mailto:ana.reyes@demo.westwoodlaw.ph)

Role:
Lawyer

Use existing approved demo information only.

---

ADMIN:

Name:
Patricia Garcia

Email:
[patricia.garcia@demo.westwoodlaw.ph](mailto:patricia.garcia@demo.westwoodlaw.ph)

Role:
Admin

The dummy accounts are for demonstration purposes only.

Do not display real passwords publicly.

The Demo Accounts section can have buttons such as:

[Enter as Client]
[Enter as Lawyer]
[Enter as Admin]

================================================== 5. CLIENT PORTAL
================

After signing in as a Client, redirect to the Client Dashboard.

Client can access:

- Dashboard
- My Matters
- Appointments
- Documents
- Notifications
- Profile

The Client can only see their own information.

Example:

Maria Santos should see Maria Santos's matters, appointments, documents, and notifications.

She should NOT be able to see Juan Dela Cruz's information.

================================================== 6. LAWYER PORTAL
================

After signing in as a Lawyer, redirect to the Lawyer Dashboard.

Lawyer can access:

- Dashboard
- My Matters
- Assigned Clients
- Appointments
- Documents
- Partner Referrals
- Profile

A Lawyer can access confidential information only for matters and clients assigned to that lawyer.

For example:

Atty. Ernesto Tabao can see the confidential information belonging to clients assigned to him.

He should NOT automatically see confidential information belonging to another lawyer's clients.

================================================== 7. ADMIN PORTAL
===============

After signing in as Admin, redirect to the Admin Dashboard.

The Admin has the highest SYSTEM MANAGEMENT privileges.

Admin can access:

- Dashboard
- User Accounts
- Client Intake
- Matters
- Appointments
- Lawyers
- Partner Network
- Documents
- Reports
- System Settings
- Audit Logs

Admin can manage the overall operation of the system.

================================================== 8. ADMIN USER ACCOUNT MANAGEMENT
================================

Create a User Management page.

Display a table containing:

- Name
- Email
- Role
- Account Status
- Date Created
- Actions

Actions:

[View]
[Edit]
[Deactivate]
[Delete]

Admin can:

- Create staff/lawyer accounts
- Edit user information
- Change permitted roles
- Deactivate accounts
- Delete accounts

When Delete is selected, show a confirmation modal:

"Delete Account?"

"Are you sure you want to permanently delete this account?"

[Cancel]
[Delete Account]

After deletion:

"Account deleted successfully."

Since this is a demo, update the frontend mock account list.

================================================== 9. ADMIN ACCESS PRINCIPLE
=========================

IMPORTANT:

ADMIN IS THE HIGHEST SYSTEM-MANAGEMENT ROLE.

However, ADMIN DOES NOT automatically have unrestricted access to privileged legal information.

Separate:

SYSTEM MANAGEMENT ACCESS

from

CONFIDENTIAL LEGAL INFORMATION ACCESS.

Admin can manage the system but must respect privacy restrictions.

================================================== 10. INFORMATION ADMIN CAN ACCESS
================================

Admin CAN access administrative client information such as:

- Client name
- Contact information
- Account status
- Matter ID
- Matter status
- Assigned lawyer
- Appointment date and time
- Intake status
- General case category
- Documents that are explicitly shared with staff/admin
- System activity records
- Audit logs

This information is needed for administrative operations.

================================================== 11. INFORMATION ADMIN CANNOT AUTOMATICALLY ACCESS
=================================================

Admin should NOT automatically be able to read:

- Private lawyer-client communications
- Confidential lawyer notes
- Private legal strategy notes
- Privileged legal documents
- Private client notes
- Documents marked "Lawyer Only"
- Documents marked "Client & Assigned Lawyer Only"
- Confidential information explicitly restricted to authorized legal personnel

Do not display the contents of restricted information to Admin.

================================================== 12. RESTRICTED INFORMATION SCREEN
=================================

If Admin attempts to open a restricted record, display:

🔒 Restricted Access

"This information contains confidential legal content and is limited to authorized legal personnel."

Show:

Access Level:
Confidential

Authorized Role:
Assigned Lawyer / Client

Status:
Restricted

Do NOT display the actual confidential content.

Add:

[Return]

Do not provide a "Bypass Access" button.

================================================== 13. DOCUMENT ACCESS LEVELS
==========================

Add access labels to documents:

PUBLIC
STAFF SHARED
CONFIDENTIAL
LAWYER ONLY
CLIENT & ASSIGNED LAWYER

Example:

Client Intake Form
Access:
Staff Shared

Case Strategy Notes
Access:
Lawyer Only

Signed Legal Agreement
Access:
Client & Assigned Lawyer

Internal Administrative Report
Access:
Staff Shared

The Admin can see documents marked Staff Shared.

The Admin cannot open documents marked Lawyer Only or Client & Assigned Lawyer unless the current user is otherwise authorized.

================================================== 14. MATTER ACCESS
=================

Admin can view the administrative overview of ALL matters.

Example:

Matter #WLF-2026-001
Client: Maria Santos
Assigned Lawyer: Atty. Ernesto Tabao
Practice Area: Labor and Industrial Relations
Status: Active

Admin can manage:

- Matter status
- Assigned lawyer
- Appointments
- Administrative information
- Documents shared with staff
- Workflow status

However, confidential legal notes inside the matter should remain restricted.

Display:

"Some information in this matter is restricted due to confidentiality."

================================================== 15. AUDIT LOGS
==============

Admin should have access to Audit Logs.

Display activities such as:

- User account created
- User account updated
- User account deactivated
- User account deleted
- Lawyer assigned to matter
- Appointment created
- Document uploaded
- Document viewed
- Access denied
- Restricted record attempted

Example:

Patricia Garcia
Admin

Attempted to access:
Private Legal Strategy Notes

Result:
Access Denied

This demonstrates privacy protection.

================================================== 16. ROLE-BASED NAVIGATION
=========================

Navigation should change depending on the logged-in role.

CLIENT NAVIGATION:

Dashboard
My Matters
Appointments
Documents
Notifications
Profile
Sign Out

LAWYER NAVIGATION:

Dashboard
My Matters
Clients
Appointments
Documents
Partner Referrals
Profile
Sign Out

ADMIN NAVIGATION:

Dashboard
User Accounts
Client Intake
Matters
Appointments
Lawyers
Partner Network
Documents
Reports
Audit Logs
System Settings
Sign Out

Do not show navigation options that the current role cannot access.

================================================== 17. ACCESS DENIED HANDLING
==========================

If a user attempts to access a page they are not authorized to access, display:

🔒 Access Denied

"You do not have permission to access this section."

[Return to Dashboard]

Examples:

Client attempting to access Admin User Management:
ACCESS DENIED

Lawyer attempting to access User Management:
ACCESS DENIED

Admin attempting to open Lawyer Only legal notes:
RESTRICTED ACCESS

================================================== 18. ACCOUNT DELETION SAFETY
===========================

When Admin deletes an account, require confirmation.

Do not delete the account immediately when the Delete button is first clicked.

Show:

Delete Account?

This action will remove the user's demo account from the system.

[Cancel]
[Confirm Delete]

After confirmation, update the mock account list.

================================================== 19. DEMO ROLE SWITCHING
=======================

For presentation purposes, include a small demo-only role/account switcher accessible from the profile menu.

Label it:

Demo Account

It should allow the presenter to quickly switch between:

Maria Santos
Client

Atty. Ernesto Tabao
Lawyer

Patricia Garcia
Admin

This should only simulate logging into different accounts.

Do not expose this as a normal feature to ordinary users.

================================================== 20. PRIVACY DESIGN
==================

Make privacy visually clear throughout the portal.

Use labels such as:

🔒 Confidential
🔒 Restricted
👤 Assigned Lawyer Only
👤 Client & Assigned Lawyer
🏢 Staff Shared

Use these labels consistently on matters, documents, and sensitive records.

================================================== 21. FRONTEND DEMO ONLY
======================

IMPORTANT:

Do not implement real authentication.

Do not implement:

- Supabase Auth
- Real password hashing
- Real database authentication
- Email verification
- Password reset emails
- Real authorization middleware
- Real backend security

Simulate all authentication and role permissions in the frontend.

However, structure the code cleanly so that the role-based access system could be connected to a real backend in the future.

================================================== 22. PRESERVE EXISTING FEATURES
==============================

Do not remove the existing:

- Westwood homepage
- Practice Areas
- Our Lawyers
- Atty. Ernesto Tabao profile
- Partner Network
- Insights & Resources
- Contact page
- Legal Inquiry
- Find My Lawyer
- Consultation flow
- Matter Management
- Appointments
- Documents
- Activity Timeline
- Reports
- Audit Logs

Continue using the existing mock data where appropriate.

Remove or avoid the old "select a role to explore the portal" experience.

The user should now experience:

Sign In
→ Authenticate as Demo Account
→ Determine Role
→ Redirect to Correct Portal

================================================== 23. FINAL USER EXPERIENCE
=========================

The complete demo flow should feel like a real law firm information system:

PUBLIC WEBSITE
↓
Start Legal Inquiry
or
Schedule Consultation
↓
Sign In / Create Account
↓
Role-Based Account
↓
CLIENT / LAWYER / ADMIN PORTAL
↓
Role-Based Features
↓
Privacy and Access Controls

The Admin should have broad system-management authority, including account deletion and management of almost every administrative feature.

However:

ADMIN ≠ unrestricted access to privileged legal information.

Confidential legal information remains restricted to authorized users.

This distinction should be visible throughout the demo and should demonstrate proper role-based access control and privacy protection.

Do not change the existing visual design unless necessary to implement these features.
