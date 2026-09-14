Build a **fully interactive, modern, responsive website prototype for Westwood Law Firm**, using the attached **“WLF Company Profile (Revised 2).pdf”** as the primary source for the firm's actual lawyers, lawyer photos, expertise, biographies, practice areas, and service information.

Use these websites as references for information architecture, design direction, and feature inspiration:

**Design / UX reference:**
[https://preslaw.com/](https://preslaw.com/)

**Existing Westwood reference:**
[https://www.wli.connectorcore.com/index.php](https://www.wli.connectorcore.com/index.php)

The website should feel like a **real operating law-firm platform**, not a static Figma landing page. Prioritize realistic functionality, user flows, mock data, forms, filtering, messaging, consultation booking, and interactive relationships between lawyers, services, and clients.

---

# 1. BRAND & DESIGN

Create a premium, credible Philippine law firm website.

Brand personality:

- Professional
- Sophisticated
- Trustworthy
- Approachable
- Strategic
- Modern
- Client-centered
- Specialized

Use a refined palette:

- Deep navy
- White / warm off-white
- Subtle gold
- Charcoal
- Muted blue-gray

Use elegant serif typography for major headings and modern sans-serif typography for body/UI.

Use:

- Editorial layouts
- Large lawyer photography
- Architecture-inspired geometry
- Sophisticated cards
- Fine borders
- Generous spacing
- Subtle shadows
- Restrained animations

Avoid generic legal clichés such as excessive gavels, scales-of-justice imagery, or generic courthouse stock photos.

Use the **actual Westwood logo** from the provided materials.

---

# 2. MAKE IT FUNCTIONAL, NOT JUST VISUAL

Do not create only static screens.

Use mock/local state or simulated backend behavior for:

- Lawyer search
- Lawyer filtering
- Practice-area filtering
- Lawyer profiles
- Sending messages
- Online inquiries
- Consultation scheduling
- Lawyer matching
- Saved lawyers
- Legal-resource search
- Forms
- Validation
- Confirmation screens
- Notifications/toasts
- Calendar selection
- Client accounts
- Specialist partner discovery

The final result should demonstrate what a real Westwood digital client platform could look and behave like.

---

# 3. NAVIGATION

Create a sticky responsive navigation:

**Home**
**About**
**Areas of Expertise**
**Our Lawyers**
**Specialist Network**
**Insights**
**Resources**
**Contact**

Primary CTA:

### Schedule a Consultation

Top-right:

### Sign In

Do not require visitors to create an account just to browse the website.

---

# 4. HOME PAGE

Create a strong hero:

### “Specialized Legal Expertise. Trusted Guidance.”

Supporting copy should communicate practical, responsive, specialized legal support.

Primary CTA:

**Schedule a Consultation**

Secondary CTA:

**Explore Our Expertise**

Then create:

### “How Can We Help?”

Selectable options:

- Business & Corporate
- Labor & Employment
- Property
- Litigation & Dispute Resolution
- Family / Personal Legal Matters
- Tax & Estate
- Banking / Financial
- Other Legal Concern

When selected, dynamically show:

- Relevant practice areas
- Relevant services
- Matching Westwood lawyers
- Contact Lawyer
- Schedule Consultation

---

# 5. PROTECT • RESOLVE • GROW

Use this as a major Westwood framework.

### PROTECT

Contracts, compliance, risk management, property and asset protection.

### RESOLVE

Litigation, negotiation, mediation, arbitration and dispute strategy.

### GROW

Business structuring, transactions, contracts, corporate matters and strategic counsel.

Make each category clickable and dynamically display related services and lawyers.

---

# 6. AREAS OF EXPERTISE

Make this one of the primary interactive features.

Create practice-area cards with:

- Practice area
- Description
- Services
- Number of relevant lawyers
- Explore Practice button

Practice-area detail pages should contain:

### Overview

### Services

### Client Needs

### Related Legal Matters

### Lawyers in This Practice

### Related Insights

### Consultation CTA

Most importantly, dynamically connect:

**Practice Area → Relevant Lawyers**

Clicking a lawyer should connect back to the relevant practice area.

---

# 7. OUR LAWYERS

Create an interactive lawyer directory using the actual lawyer information and photographs from the attached PDF.

Each card:

- Photo
- Name
- Position
- Expertise
- Short introduction
- View Profile
- Send Message
- Schedule Consultation

Add:

### Search our lawyers

and filters for:

- Practice Area
- Expertise
- Lawyer

Filtering must actually update the displayed results.

---

# 8. LAWYER PROFILE

Every lawyer should have a detailed profile page with:

- Actual portrait
- Name
- Position
- Biography
- Areas of expertise
- Practice areas
- Relevant services
- Related insights
- Contact options
- Consultation scheduling

Do not invent credentials, awards, education, qualifications, rankings, or case results not supported by the provided materials.

---

# 9. MESSAGE A LAWYER

When the user clicks:

### Send Message

open a functional modal/page:

**Contact [Lawyer Name]**

Fields:

- Full Name
- Email
- Contact Number
- Legal Concern / Subject
- Preferred Contact Method
- Message
- Preferred Consultation Date

CTA:

### Send Message

Simulate:

**Submitting → Processing → Success**

Success screen:

### “Your message has been received.”

Include:

- Reference number
- Assigned lawyer
- Submitted date
- Next steps
- Schedule Consultation
- Return to Lawyer Profile

Store the mock message in local state.

Include a clear notice that submitting an inquiry does not automatically establish an attorney-client relationship.

---

# 10. ONLINE CONSULTATION / INQUIRY SYSTEM

Build a dedicated **Online Consultation & Inquiry System**.

This should be one of the most important features of the website.

Create a flow:

### Step 1 — What do you need help with?

Practice-area options.

### Step 2 — What type of assistance do you need?

Examples:

- Legal Consultation
- Contract Review
- Business Advice
- Dispute Assistance
- Compliance Guidance
- Property Matter
- Other

### Step 3 — Select Lawyer

Automatically show lawyers relevant to the selected concern.

Allow:

### “Let Westwood recommend a lawyer”

### Step 4 — Consultation Method

- Video Consultation
- Phone Consultation
- In-Person Consultation
- Email Inquiry

### Step 5 — Date & Time

Create a mock availability calendar.

### Step 6 — Client Information

- Full Name
- Email
- Contact Number
- Legal Concern
- Brief Description

### Step 7 — Confirmation

Show:

**Consultation Request Submitted**

with:

- Lawyer
- Practice Area
- Consultation type
- Date
- Time
- Reference number
- Status

Example:

**WLF-2026-00421**

Add a follow-up status:

### “Westwood will review your inquiry and contact you regarding the next step.”

Do not present the system as providing automated legal advice.

---

# 11. FIND THE RIGHT LAWYER

Create an interactive matching experience:

### “Find the Right Westwood Lawyer”

Ask 3–4 questions such as:

**What do you need help with?**

**Is this for an individual or a business?**

**What type of assistance are you looking for?**

**How would you prefer to consult?**

Use mock matching logic.

Result:

### Recommended Lawyers

Show:

- Lawyer
- Expertise
- Matching reason
- View Profile
- Send Message
- Schedule Consultation

This is a routing and discovery feature, not an automated legal-advice tool.

---

# 12. SPECIALIST PARTNER NETWORK

Add a dedicated feature called:

# Westwood Specialist Partner Network

This should demonstrate how Westwood can extend its capabilities through a trusted network of appropriate professionals and specialists.

Create categories such as:

### Legal Specialists

Specialized legal professionals for matters outside a primary practice area.

### Financial & Tax Experts

CPAs, tax advisers, auditors, and financial professionals.

### Technical & Industry Experts

Engineers, appraisers, IT/cybersecurity professionals, and industry specialists.

### Business & Professional Partners

Business advisers, consultants, and professional networks.

The network should be presented as a **collaborative expertise ecosystem**, not as fee-sharing with non-lawyers.

---

## Specialist Network Directory

Create an interactive directory with:

- Specialist name
- Organization
- Specialty
- Industry
- Location
- Description
- Services supported
- Connected Westwood practice areas

Add filters:

- Specialty
- Industry
- Practice Area
- Professional Type

Add search:

### “Search specialist partners…”

---

## Specialist Profile

Clicking a specialist should show:

- Specialist name
- Organization
- Expertise
- Description
- Areas they support
- Related Westwood practice areas
- Related lawyers

CTA:

### “Request Specialist Support”

---

## Specialist Referral Workflow

Create a mock workflow:

**Client Need**

↓

**Westwood Practice Area**

↓

**Westwood Lawyer**

↓

**Specialist Required**

↓

**Recommended Specialist**

↓

**Referral / Collaboration Request**

Show a confirmation screen after submission.

Clearly indicate that the system is a **demo/prototype referral workflow** and actual referrals would be subject to firm policies, conflicts checks, confidentiality, client consent, and applicable professional rules.

---

# 13. BUSINESS LEGAL HEALTH CHECK

Create:

### Business Legal Health Check

Target:

- Entrepreneurs
- Startups
- SMEs
- Business owners

Ask questions about:

- Contracts
- Employment documentation
- Corporate records
- Compliance
- Asset protection
- Dispute preparedness

Return a simple demo result:

### Strong

### Needs Attention

### High Priority

Then recommend appropriate Westwood practice areas and lawyers.

Do not characterize the result as formal legal advice.

---

# 14. SME LEGAL RETAINER PACKAGES

Add:

### Ongoing Legal Support for Businesses

Create clearly labelled **demo/example** packages:

### Essential

### Business

### Corporate

Potential features:

- Legal consultations
- Contract reviews
- Compliance support
- Legal risk reviews
- Priority response

Do not make real pricing claims.

CTA:

### Discuss a Retainer

---

# 15. INSIGHTS & LEGAL NEWS

Create:

### Westwood Insights

Categories:

- Corporate
- Employment
- Property
- Litigation
- Tax
- Family
- Legal Updates

Features:

- Search
- Categories
- Featured article
- Related lawyer
- Related practice area
- Article pages

Use demo articles when actual source material is unavailable and clearly mark them as demo content.

---

# 16. WESTWOOD LEGAL LIBRARY

Create an interactive resource library.

Features:

- Search
- Topic filters
- Content-type filters
- Sorting
- Resource detail pages

Types:

- Legal Updates
- Articles
- Guides
- FAQs
- Seminars
- Firm Announcements

Search should actually filter mock content.

---

# 17. SEMINARS & EVENTS

Create:

### Seminars & Legal Workshops

Each event includes:

- Topic
- Date
- Location / Online
- Speaker
- Description
- Register

Registration should open a functional mock form and produce a confirmation screen.

---

# 18. CLIENT ACCOUNT SYSTEM

Make client accounts optional.

Visitors can use the website without signing in.

After submitting an inquiry or consultation request, offer:

### “Create your Westwood Client Account”

The demo account can provide:

- Consultation requests
- Upcoming consultations
- Messages
- Saved lawyers
- Saved resources
- Appointment status
- Profile information

Create a separate:

### Lawyer / Staff Sign In

with a demo dashboard.

---

# 19. CLIENT PORTAL DEMO

Create a **Demo Client Portal**.

Dashboard:

### Active Matters

### Upcoming Consultations

### Messages

### Documents

### Appointment Status

### Recent Updates

Clearly label it as a prototype/demo.

Do not imply that real confidential client data is being stored.

---

# 20. LAWYER / STAFF DASHBOARD DEMO

Create:

### Demo Admin / Staff Dashboard

Widgets:

- Consultation Requests
- New Inquiries
- Assigned Clients
- Upcoming Consultations
- Most Viewed Practice Area
- Most Contacted Lawyer

Add a table:

**Recent Inquiries**

Columns:

- Name
- Practice Area
- Assigned Lawyer
- Status
- Date

Statuses:

- New
- Contacted
- Scheduled
- Closed

Use mock data.

---

# 21. SAVE LAWYER

Add a bookmark/heart button to lawyer profiles.

When clicked:

### Saved to My Lawyers

Create a:

### My Saved Lawyers

section in the client account.

Use local state/localStorage if supported.

---

# 22. GLOBAL SEARCH

Create a website-wide search covering:

- Lawyers
- Practice Areas
- Services
- Insights
- Resources
- FAQs
- Specialist Partners

Group search results by content type.

---

# 23. CONTACT PAGE

Create a professional Contact page using actual Westwood contact information from the supplied materials and official reference website.

Include:

- Address
- Phone
- Email
- Social links
- Online inquiry form
- Consultation CTA
- Map placeholder

Do not invent missing information.

---

# 24. GENERAL INQUIRY

Create:

### “How Can We Help?”

Fields:

- Full Name
- Email
- Contact Number
- Legal Concern
- Preferred Contact Method
- Message

CTA:

### Send Inquiry

After submission:

**Inquiry Received**

Show:

- Reference number
- Submitted date
- Next step
- Contact information

---

# 25. FAQ

Create interactive accordion FAQs around:

- Scheduling consultations
- Selecting a lawyer
- Online consultations
- Client accounts
- General inquiries
- Confidentiality
- Attorney-client relationship
- Specialist referrals

---

# 26. WEBSITE USER JOURNEY

The core experience should be:

**Discover Westwood**

↓

**Explore Areas of Expertise**

↓

**Find the Right Lawyer**

↓

**View Lawyer Profile**

↓

**Send a Message / Submit Online Inquiry**

↓

**Schedule Consultation**

↓

**Optional Client Account**

↓

**Ongoing Client Relationship**

For more complex matters:

**Client Need**

↓

**Westwood Lawyer**

↓

**Specialist Partner Network**

↓

**Coordinated Professional Support**

---

# 27. MOCK DATA

Create realistic mock data structures for:

### Lawyers

```text
id
name
photo
position
bio
expertise[]
practiceAreas[]
email
availability[]
```

### Practice Areas

```text
id
name
description
services[]
lawyerIds[]
```

### Messages

```text
id
senderName
email
lawyerId
subject
message
status
createdAt
```

### Consultations

```text
id
clientName
lawyerId
practiceArea
date
time
type
status
referenceNumber
```

### Specialists

```text
id
name
organization
specialty
industry
description
supportedPracticeAreas[]
```

### Referrals

```text
id
clientId
lawyerId
specialistId
reason
status
createdAt
```

### Articles

```text
id
title
category
author
lawyerId
date
content
```

Use the actual lawyers, photos, expertise, and service details from the attached PDF.

Where additional mock data is needed for functionality, clearly label it as demo content.

---

# 28. CONTENT RULES

The attached Westwood company profile is the primary source of truth for:

- Lawyer names
- Lawyer photos
- Positions
- Expertise
- Biographies
- Practice areas
- Services
- Firm information

Do not invent:

- Lawyer credentials
- Awards
- Case victories
- Rankings
- Testimonials
- Client logos
- Statistics
- Offices
- Legal specializations unsupported by source material

Do not use lorem ipsum.

---

# 29. RESPONSIVE DESIGN

Desktop, tablet, and mobile must all work.

Mobile should include:

- Hamburger menu
- Sticky consultation CTA
- Mobile lawyer directory
- Mobile filtering
- Full-screen consultation flow
- Full-screen message modal
- Mobile specialist directory
- Easy-to-complete forms

---

# 30. ACCESSIBILITY

Implement:

- Accessible labels
- Keyboard navigation
- Proper contrast
- Focus states
- Accessible modals
- Semantic headings
- Alt text
- Clear error messages

---

# 31. SIGNATURE PLATFORM EXPERIENCE

The website should ultimately feel like:

## “A modern legal platform that connects clients to the right Westwood legal expertise.”

The strongest interconnected feature should be:

**CLIENT NEED ↔ PRACTICE AREA ↔ LAWYER ↔ SPECIALIST PARTNER ↔ ONLINE INQUIRY ↔ CONSULTATION**

Every part of this flow should feel connected and clickable.

Prioritize **working interactions and realistic client journeys** over adding excessive decorative sections.
