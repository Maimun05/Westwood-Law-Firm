-- ============================================================================
-- Westwood Law Firm - Content Seed Data
-- ============================================================================
-- This migration seeds all content tables with production data from mockData.ts
-- Run this AFTER deploying 20260918_content_tables.sql

BEGIN;

-- ============================================================================
-- 0. Schema guard: ensure every column this seed writes exists.
-- ============================================================================
-- The app (and this seed) expect a richer content schema than the original
-- CREATE TABLE statements declared, because the production database was built
-- up with additional ad-hoc scripts. These statements are idempotent: they are
-- no-ops wherever the column already exists, and they make a fresh deployment
-- work from the migration chain alone.
-- ============================================================================

ALTER TABLE public.practice_areas
  ADD COLUMN IF NOT EXISTS services        TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS client_needs    TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS related_matters TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS lawyer_ids      TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE public.practice_areas ALTER COLUMN slug  DROP NOT NULL;
ALTER TABLE public.practice_areas ALTER COLUMN color DROP NOT NULL;
ALTER TABLE public.practice_areas ALTER COLUMN color SET DEFAULT '#c9a84c';

ALTER TABLE public.articles
  ADD COLUMN IF NOT EXISTS author_name       TEXT,
  ADD COLUMN IF NOT EXISTS author_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS published_date    DATE,
  ADD COLUMN IF NOT EXISTS read_time         TEXT;
ALTER TABLE public.articles ALTER COLUMN slug DROP NOT NULL;

ALTER TABLE public.specialists
  ADD COLUMN IF NOT EXISTS industry                 TEXT,
  ADD COLUMN IF NOT EXISTS location                 TEXT,
  ADD COLUMN IF NOT EXISTS description              TEXT,
  ADD COLUMN IF NOT EXISTS services_supported       TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS connected_practice_areas TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS specialist_type          TEXT;
ALTER TABLE public.specialists ALTER COLUMN title DROP NOT NULL;
ALTER TABLE public.specialists ALTER COLUMN email DROP NOT NULL;
ALTER TABLE public.specialists ALTER COLUMN bio   DROP NOT NULL;

ALTER TABLE public.faqs ALTER COLUMN id SET DEFAULT (gen_random_uuid())::text;
ALTER TABLE public.faqs ALTER COLUMN category DROP NOT NULL;
-- The FAQ seed has no stable id, so give it a natural key to make re-runs safe.
CREATE UNIQUE INDEX IF NOT EXISTS uq_faqs_question ON public.faqs(question);

ALTER TABLE public.seminar_events
  ADD COLUMN IF NOT EXISTS event_date         DATE,
  ADD COLUMN IF NOT EXISTS event_time         TEXT,
  ADD COLUMN IF NOT EXISTS time               TEXT,
  ADD COLUMN IF NOT EXISTS mode               TEXT,
  ADD COLUMN IF NOT EXISTS speaker_name       TEXT,
  ADD COLUMN IF NOT EXISTS speaker_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS is_published       BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE public.seminar_events ALTER COLUMN date    DROP NOT NULL;
ALTER TABLE public.seminar_events ALTER COLUMN speaker DROP NOT NULL;

ALTER TABLE public.retainer_packages
  ADD COLUMN IF NOT EXISTS tagline        TEXT,
  ADD COLUMN IF NOT EXISTS price_display  TEXT,
  ADD COLUMN IF NOT EXISTS cta_text       TEXT,
  ADD COLUMN IF NOT EXISTS is_highlighted BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.retainer_packages ALTER COLUMN description DROP NOT NULL;
ALTER TABLE public.retainer_packages ALTER COLUMN price       DROP NOT NULL;

-- ============================================================================
-- Practice Areas
-- ============================================================================

INSERT INTO public.practice_areas (id, name, description, services, icon, client_needs, related_matters, lawyer_ids, is_active) VALUES
('labor', 'Labor and Industrial Relations', 'Expert guidance on all aspects of Philippine labor law, industrial relations, and employment matters for both employers and employees.', 
  ARRAY['Employment Contract Review', 'Labor Dispute Resolution', 'NLRC Representation', 'DOLE Compliance', 'Retrenchment & Separation', 'Employee Benefits Advisory', 'Workplace Policy Drafting', 'Collective Bargaining Negotiations'],
  '⚖️',
  ARRAY['Employment disputes and illegal dismissal cases', 'Setting up HR policies and employment contracts', 'DOLE compliance and audits', 'Collective bargaining negotiations'],
  ARRAY['Corporate and Commercial Laws', 'Civil and Administrative Matters'],
  ARRAY['l1', 'l2'],
  true),

('banking', 'Banking Laws', 'Legal support for financial institutions, investors, and businesses on banking regulations, loan transactions, and BSP compliance.',
  ARRAY['Loan Documentation', 'Security Agreements', 'BSP Regulatory Compliance', 'Debt Restructuring', 'Letters of Credit', 'Project Finance', 'Investment Agreements', 'Financial Regulatory Advisory'],
  '🏦',
  ARRAY['Financing and loan documentation', 'BSP compliance for financial institutions', 'Debt restructuring matters', 'Investment structuring and agreements'],
  ARRAY['Corporate and Commercial Laws', 'Taxation', 'Asset Recovery'],
  ARRAY['l3', 'l5'],
  true),

('asset-recovery', 'Asset Recovery', 'Legal strategies for recovering assets, enforcing judgments, and pursuing claims against individuals or entities who owe obligations.',
  ARRAY['Judgment Enforcement', 'Writ of Execution', 'Attachment & Garnishment', 'Foreclosure Proceedings', 'Collection Suits', 'Debt Recovery Advisory', 'Asset Tracing', 'Creditor Rights'],
  '🔍',
  ARRAY['Recovering unpaid debts or obligations', 'Enforcing court judgments', 'Foreclosing on mortgaged assets', 'Pursuing claims against debtors'],
  ARRAY['Civil and Administrative Matters', 'Banking Laws', 'Corporate and Commercial Laws'],
  ARRAY['l2', 'l3'],
  true),

('corporate', 'Corporate and Commercial Laws', 'Comprehensive legal support for businesses at every stage — from incorporation to complex commercial transactions and corporate governance.',
  ARRAY['Business Incorporation', 'Corporate Governance', 'Mergers & Acquisitions', 'Joint Ventures', 'Contract Drafting & Review', 'Regulatory Compliance', 'Corporate Secretarial Services', 'Shareholders Agreements'],
  '🏢',
  ARRAY['Starting or restructuring a business', 'Entering into major contracts', 'Corporate compliance and governance', 'Business acquisitions or partnerships'],
  ARRAY['Banking Laws', 'Taxation', 'Labor and Industrial Relations'],
  ARRAY['l1', 'l3'],
  true),

('civil', 'Civil and Administrative Matters', 'Representation and counsel in civil cases and proceedings before administrative agencies and government bodies throughout the Philippines.',
  ARRAY['Civil Litigation', 'Administrative Cases', 'Injunctions & Provisional Remedies', 'Appeals', 'Mediation & ADR', 'Collection Suits', 'Contractual Disputes', 'Administrative Appeals'],
  '🔨',
  ARRAY['Filing or defending civil lawsuits', 'Administrative proceedings and disputes', 'Urgent relief through injunctions', 'Alternative dispute resolution'],
  ARRAY['Criminal Cases', 'Labor and Industrial Relations', 'Asset Recovery'],
  ARRAY['l2', 'l4', 'l6'],
  true),

('criminal', 'Criminal Cases', 'Defense and prosecution representation in criminal matters before the courts and prosecutorial offices throughout the Philippines.',
  ARRAY['Criminal Defense', 'Prosecution Assistance', 'Preliminary Investigation Support', 'Bail Applications', 'Criminal Litigation', 'Appeals', 'White-Collar Crime Defense', 'Cybercrime Cases'],
  '🛡️',
  ARRAY['Defense in criminal proceedings', 'Assistance in filing criminal complaints', 'Handling bail applications', 'Criminal appeals'],
  ARRAY['Civil and Administrative Matters', 'Immigration'],
  ARRAY['l2', 'l3'],
  true),

('immigration', 'Immigration', 'Comprehensive immigration law services for foreign nationals, employers, and individuals navigating Philippine immigration requirements.',
  ARRAY['Visa Applications', 'Alien Employment Permit (AEP)', 'Special Investor''s Resident Visa (SIRV)', 'Long-Stay Visitor Visa Extension', 'Special Non-Immigrant Visa', 'Deportation Defense', 'Naturalization', 'Residency Documentation'],
  '🌏',
  ARRAY['Visa applications and renewals', 'Alien employment permit processing', 'Residency and naturalization matters', 'Deportation defense'],
  ARRAY['Civil and Administrative Matters', 'Corporate and Commercial Laws'],
  ARRAY['l4'],
  true),

('annulment', 'Annulment of Marriages', 'Confidential and compassionate legal representation in annulment proceedings and related family law matters in the Philippines.',
  ARRAY['Annulment Petition Filing', 'Declaration of Nullity', 'Legal Separation', 'Psychological Incapacity Cases', 'Foreign Divorce Recognition', 'Child Custody & Support', 'Property Settlement', 'Post-Decree Matters'],
  '⚖️',
  ARRAY['Marriage annulment or declaration of nullity', 'Legal separation proceedings', 'Recognition of foreign divorce decrees', 'Related custody and property matters'],
  ARRAY['Civil and Administrative Matters', 'Taxation'],
  ARRAY['l6'],
  true),

('cooperatives', 'Cooperatives', 'Legal advisory and compliance services for cooperatives registered under the Cooperative Development Authority and related Philippine laws.',
  ARRAY['CDA Registration & Compliance', 'Cooperative Bylaws Drafting', 'Governance Advisory', 'Member Rights & Disputes', 'Labor Compliance for Cooperatives', 'Credit Cooperative Regulations', 'Cooperative Audit Support', 'Dissolution & Liquidation'],
  '🤝',
  ARRAY['Cooperative registration and compliance', 'Drafting or revising cooperative bylaws', 'Governance and member dispute issues', 'CDA audit and regulatory matters'],
  ARRAY['Corporate and Commercial Laws', 'Labor and Industrial Relations'],
  ARRAY['l7'],
  true),

('energy', 'Energy', 'Legal representation and regulatory advisory for clients in the energy sector, including Independent Power Producers and electrical utilities.',
  ARRAY['ERC Regulatory Compliance', 'Power Supply Agreements', 'Independent Power Producer Advisory', 'Renewable Energy Permits', 'Distribution Utility Compliance', 'Energy Contract Review', 'Rate Cases', 'Franchise Applications'],
  '⚡',
  ARRAY['ERC compliance and regulatory matters', 'Power supply and distribution agreements', 'Renewable energy project permitting', 'Franchise and rate case proceedings'],
  ARRAY['Corporate and Commercial Laws', 'Mining', 'Civil and Administrative Matters'],
  ARRAY['l7'],
  true),

('mining', 'Mining', 'Legal services for mining companies, contractors, and investors navigating the Philippine Mining Act and related environmental regulations.',
  ARRAY['MPSA & FTAA Applications', 'MGB Regulatory Compliance', 'Mining Contract Review', 'Environmental Compliance Certificates', 'Surface Rights Negotiations', 'Small-Scale Mining Permits', 'Mining Disputes', 'DENR Regulatory Matters'],
  '⛏️',
  ARRAY['Mining permit applications and renewals', 'MGB and DENR compliance matters', 'Mining contract drafting and review', 'Environmental compliance for mining operations'],
  ARRAY['Energy', 'Corporate and Commercial Laws', 'Civil and Administrative Matters'],
  ARRAY['l7'],
  true),

('taxation', 'Taxation', 'Proactive tax planning, BIR compliance, and estate planning services for individuals and businesses under Philippine tax laws.',
  ARRAY['Tax Planning & Advisory', 'BIR Compliance', 'Estate Planning & Settlement', 'Tax Assessment Defense', 'Succession Planning', 'Donor''s Tax & Estate Tax', 'VAT Compliance', 'Transfer Pricing'],
  '📋',
  ARRAY['Tax planning for individuals and businesses', 'Estate and succession planning', 'Challenging BIR tax assessments', 'Estate settlement and tax compliance'],
  ARRAY['Corporate and Commercial Laws', 'Annulment of Marriages', 'Banking Laws'],
  ARRAY['l1', 'l5'],
  true)
ON CONFLICT (id) DO NOTHING;

-- slug is UNIQUE NOT NULL in the canonical schema; the seed identifies rows by
-- id, so derive a unique slug from the id wherever it was not set.
UPDATE public.practice_areas SET slug = id WHERE slug IS NULL;

-- ============================================================================
-- Articles
-- ============================================================================

INSERT INTO public.articles (id, title, category, author_name, author_profile_id, published_date, excerpt, content, read_time, is_published) VALUES
('a1', 'Understanding the Labor Code: Rights and Obligations of Employers and Employees', 'Labor and Industrial Relations', 'Atty. Ernesto "Boyet" Tabao', NULL, '2026-09-05', 
  'The Labor Code of the Philippines governs the relationship between employers and employees. Understanding its core provisions is essential for both parties to avoid costly disputes.',
  'The Labor Code of the Philippines (Presidential Decree No. 442) provides the legal framework governing employment relationships in the country. Key areas include standards for wages, hours of work, leave benefits, security of tenure, and procedures for termination and separation pay.

Employers must ensure compliance with DOLE issuances, particularly on minimum wage orders, mandatory benefits, and proper documentation of employment status. Employees, in turn, have the right to security of tenure and cannot be dismissed without just or authorized cause and due process.',
  '5 min read',
  true),

('a2', 'Corporate Formation in the Philippines: A Step-by-Step Guide', 'Corporate and Commercial Laws', 'Atty. Maria Cristina L. Santos', NULL, '2026-08-28',
  'Setting up a corporation in the Philippines involves several regulatory steps across the SEC, BIR, and local government units. Here is what you need to know.',
  'Incorporating a business in the Philippines requires registration with the Securities and Exchange Commission (SEC), enrollment with the Bureau of Internal Revenue (BIR), and securing local business permits. The Revised Corporation Code (Republic Act No. 11232) introduced significant changes, including the allowance of one-person corporations and removing the minimum number of incorporators.

Key documents required include Articles of Incorporation, By-Laws, and proof of paid-in capital. Legal counsel is highly recommended to ensure the structure and articles comply with regulatory requirements and protect the interests of all shareholders.',
  '6 min read',
  true),

('a3', 'Philippine Immigration: Visa Options for Foreign Nationals', 'Immigration', 'Atty. Lorraine A. Dela Cruz', NULL, '2026-08-15',
  'Foreign nationals in the Philippines have several visa options depending on their purpose of stay — from work visas to investor residency. This guide outlines the key categories.',
  'The Philippine Bureau of Immigration administers various visa categories for foreign nationals. The most common include the 9(g) Pre-Arranged Employee Visa for those with approved Alien Employment Permits, the Special Investor''s Resident Visa (SIRV) for qualifying investors, and the 13-series visas for spouses and dependents of Filipino citizens.

Alien Employment Permits (AEPs) are required for foreign nationals employed in the Philippines and are issued by the Department of Labor and Employment (DOLE). Legal assistance is strongly recommended to ensure timely processing and compliance.',
  '5 min read',
  true),

('a4', 'Estate Planning Under Philippine Law: Protecting Your Family''s Future', 'Taxation', 'Atty. Carlos Gabriel M. Torres', NULL, '2026-07-30',
  'Many Filipino families delay estate planning, resulting in costly estate taxes and protracted settlement proceedings. A well-structured plan protects your family''s future.',
  'Estate planning under Philippine law involves preparing for the orderly transfer of assets upon death through instruments such as wills, trusts, deeds of donation, and inter vivos transfers. The TRAIN Law amended the estate tax rate to a flat six percent (6%) of the net estate, making estate tax compliance more straightforward.

A proper estate plan can minimize tax exposure, prevent family disputes, and ensure that assets reach intended beneficiaries efficiently. Westwood Law advises individuals and families to begin estate planning early to take advantage of available legal strategies.',
  '5 min read',
  true),

('a5', 'Annulment of Marriage in the Philippines: Process, Grounds, and Timeline', 'Annulment of Marriages', 'Atty. Sofia Isabelle B. Mendoza', NULL, '2026-07-18',
  'Annulment remains one of the most frequently asked-about legal processes in the Philippines. This guide provides a clear overview of the grounds, process, and realistic timeline.',
  'Annulment in the Philippines is a judicial process that voids or declares a marriage voidable. The grounds for annulment under the Family Code include psychological incapacity, fraud, force or intimidation, and lack of parental consent for underage marriages.

The process involves filing a petition in the Regional Trial Court, service of summons, psychological evaluation, trial, and eventual finality of the decision. Realistic timelines range from two to five years depending on court dockets. All persons considering annulment are encouraged to consult with a qualified family law practitioner to understand their specific options.',
  '7 min read',
  true),

('a6', 'Energy Regulatory Commission: Compliance Guide for Independent Power Producers', 'Energy', 'Atty. Marco Antonio R. Villanueva', NULL, '2026-07-05',
  'The Energy Regulatory Commission governs the Philippine power sector. Independent Power Producers and distribution utilities must navigate a complex set of regulatory requirements.',
  'The Energy Regulatory Commission (ERC) is the independent, quasi-judicial regulatory body created under the Electric Power Industry Reform Act (EPIRA) to promote competition, encourage market development, and ensure customer choice in the Philippine power sector.

Independent Power Producers (IPPs) and distribution utilities must comply with ERC rules covering generation, transmission, distribution, and supply. Key compliance areas include rate filings, generation contracts, and service reliability standards. Legal representation before the ERC is essential for entities engaged in the energy sector.',
  '6 min read',
  true)
ON CONFLICT (id) DO NOTHING;

UPDATE public.articles SET slug = id WHERE slug IS NULL;

-- The public pages read reading_time / published_at / author_id. The seed above
-- writes the friendlier read_time / published_date / author_profile_id columns
-- (kept for reference), so mirror them onto the columns the app actually reads.
UPDATE public.articles SET
  reading_time = COALESCE(NULLIF(read_time, ''), reading_time),
  published_at = COALESCE(published_at, published_date::TIMESTAMPTZ),
  author_id    = COALESCE(author_id, author_profile_id)
WHERE read_time IS NOT NULL OR published_date IS NOT NULL OR author_profile_id IS NOT NULL;

-- ============================================================================
-- Specialists
-- ============================================================================

INSERT INTO public.specialists (id, name, organization, specialty, industry, location, description, services_supported, connected_practice_areas, specialist_type, is_active) VALUES
('s1', 'Klassic Solutions Inc.', 'Klassic Solutions Inc.', 'Manpower & Support Services', 'Human Resources & Manpower', 'Metro Manila, Philippines',
  'Klassic Solutions Inc. is a WLF partner providing manpower and support services to complement the firm''s legal engagements. They assist clients with staffing, HR support, and workforce management needs.',
  ARRAY['Manpower Deployment', 'HR Support Services', 'Staffing Solutions', 'Workforce Management'],
  ARRAY['labor', 'corporate'],
  'Manpower & Support Partner',
  true),

('s2', 'Accountants and Tax Experts', 'Accountants and Tax Experts', 'Accountancy & Tax Services', 'Accounting & Finance', 'Metro Manila, Philippines',
  'A WLF partner network of accountants and tax professionals providing accountancy and tax services to complement Westwood''s legal practice. They assist clients with accounting, bookkeeping, and tax compliance needs.',
  ARRAY['Accounting Services', 'Tax Preparation', 'Bookkeeping', 'Financial Reporting', 'BIR Compliance Support'],
  ARRAY['taxation', 'corporate', 'banking'],
  'Accounting & Tax Partner',
  true),

('s3', 'Klassic Marketing Inc.', 'Klassic Marketing Inc.', 'Marketing & Business Development', 'Marketing & Advertising', 'Metro Manila, Philippines',
  'Klassic Marketing Inc. is a WLF partner providing marketing and business development services to assist clients in growing and positioning their businesses effectively.',
  ARRAY['Marketing Strategy', 'Brand Development', 'Business Development', 'Advertising'],
  ARRAY['corporate', 'cooperatives'],
  'Marketing Partner',
  true),

('s4', 'Brains Infinite Innovations Inc.', 'Brains Infinite Innovations Inc.', 'Marketing & Innovative Solutions', 'Marketing & Technology', 'Metro Manila, Philippines',
  'Brains Infinite Innovations Inc. is a WLF partner specializing in marketing requirements and innovative business solutions. They provide creative and technology-driven approaches to help clients with their marketing needs.',
  ARRAY['Marketing Solutions', 'Innovation Consulting', 'Digital Marketing', 'Business Solutions'],
  ARRAY['corporate', 'energy'],
  'Marketing & Innovation Partner',
  true)
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- Corporate Clients
-- ============================================================================

INSERT INTO public.corporate_clients (id, name, is_active) VALUES
('cc1', 'Club Filipino', true),
('cc2', 'Citibeds Inc.', true),
('cc3', 'Nurture Spa', true),
('cc4', 'Spa Association of the Philippines', true),
('cc5', 'Philippine Federation of Electric Cooperatives', true),
('cc6', 'Batangas II Electric Cooperative Inc.', true),
('cc7', 'Philippine Airlines Employees Association Credit Cooperative Inc.', true),
('cc8', 'Azcor Lightings', true),
('cc9', 'Citibank', true),
('cc10', 'Philippine Savings Bank', true),
('cc11', 'Public Safety Mutual Benefit Fund Inc.', true),
('cc12', 'Comglasco AC Corporation', true),
('cc13', 'F.R. Sevilla Industrial and Development Corporation', true),
('cc14', 'International Veterinary and Agrochemical Inc.', true),
('cc15', 'CP Treasures of the Orient Inc.', true),
('cc16', 'Global Strategic Partners Distribution Inc.', true),
('cc17', 'Corporate Protection Inc.', true),
('cc18', 'My Company Business International Inc.', true),
('cc19', 'Aceconstruct Inc.', true),
('cc20', 'Acespecialist Designers and Builders Inc.', true),
('cc21', 'Power One Corporation', true),
('cc22', 'Sky Systems Victory Mfg. Inc.', true),
('cc23', 'ASECSOFT Inc.', true),
('cc24', 'Popoy''s Grill Inc.', true),
('cc25', 'Multi-International Business Data Systems Inc.', true),
('cc26', 'Oceanic Container Lines Inc.', true),
('cc27', 'Giant Eagle Security Services Inc.', true),
('cc28', 'Dine Asia Guide Publishing Inc.', true),
('cc29', 'J.F Rubber Philippines Inc.', true),
('cc30', 'F.R. Sevilla Industrial and Development Corp.', true),
('cc31', 'Excel Green Kard Inc.', true),
('cc32', 'Techno Development and Chemical Corporation', true),
('cc33', 'Clean Haul Environment', true),
('cc34', 'Virginia Foods Inc.', true),
('cc35', 'Bio-Pharma Industry Corp.', true),
('cc36', 'Asmara Inc.', true),
('cc37', 'D&L Industries Inc.', true),
('cc38', 'ISC Consolsys Corporation', true),
('cc39', 'Chem Standards Scientific Corporation', true),
('cc40', 'Association Alliances International Inc.', true),
('cc41', 'Asian Compassion Asian Youth Inc', true),
('cc42', 'Dozzegon Construction Supply Inc.', true),
('cc43', 'Romy Clemente Airconditioning', true)
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- FAQs
-- ============================================================================

INSERT INTO public.faqs (question, answer, display_order, is_active) VALUES
('How do I schedule a consultation with Westwood Law Firm?', 
  'You can schedule a consultation through our website by clicking ''Schedule a Consultation'' and completing the online booking flow. You may also call our office at (02) 7957 2121 or send an email to westwoodlawfirm1@gmail.com. Our team will confirm your appointment within 24 hours.',
  1, true),

('How do I select the right lawyer for my concern?',
  'You can use our ''Find My Lawyer'' matching tool, which asks a few questions about your legal concern and recommends relevant Westwood lawyers. You may also browse our Lawyers directory and filter by practice area. Our team is always happy to assist you in matching your concern to the right expert.',
  2, true),

('Can I consult online or by phone?',
  'Yes. We offer video consultations, phone consultations, email inquiries, and in-person consultations at our San Juan City office. You can select your preferred consultation method during the booking process.',
  3, true),

('Do I need a client account to use this website?',
  'No. You can browse the website, explore practice areas, read insights, and submit inquiries without creating a client account. An account is optional and provides additional features such as tracking consultation requests and accessing the client portal.',
  4, true),

('Is submitting an inquiry the same as retaining a lawyer?',
  'No. Submitting an online inquiry or scheduling a consultation does not establish an attorney-client relationship. An attorney-client relationship is formed only upon execution of a formal engagement agreement with Westwood Law Firm.',
  5, true),

('How is my information kept confidential?',
  'Westwood Law Firm treats all client communications and information with strict confidentiality in accordance with the Code of Professional Responsibility and applicable data privacy laws under Republic Act No. 10173. Information submitted through this website is used solely for the purpose of responding to your inquiry.',
  6, true),

('What is the Westwood Partner Network?',
  'Westwood Law Firm partners with non-legal professional networks to extend services to clients. Partners include manpower and support services providers, accountants and tax experts, and marketing specialists. Referrals are always subject to client consent and applicable professional rules.',
  7, true),

('Where is Westwood Law Firm located?',
  'Westwood Law Firm is located at Suite 1004 Atlanta Center, 31 Annapolis St., Greenhills, 1502 San Juan City, Metropolitan Manila, Philippines. We also offer remote consultations to accommodate clients in other parts of the country.',
  8, true)
ON CONFLICT (question) DO NOTHING;

-- ============================================================================
-- Seminar Events
-- ============================================================================

INSERT INTO public.seminar_events (id, title, event_date, event_time, location, mode, speaker_name, speaker_profile_id, description, is_published) VALUES
('e1', 'Labor Law and Industrial Relations Seminar', '2026-10-15', '9:00 AM – 12:00 PM', 'Westwood Law Firm, Suite 1004 Atlanta Center, San Juan City', 'In-Person', 'Atty. Ernesto "Boyet" Tabao', NULL,
  'A practical seminar on Philippine labor law, industrial relations, and employment compliance. Covers key provisions of the Labor Code, DOLE issuances, and best practices for employers and HR practitioners.',
  true),

('e2', 'Corporate Compliance and Business Law Forum', '2026-10-22', '2:00 PM – 5:00 PM', 'Online (Zoom)', 'Online', 'Atty. Maria Cristina L. Santos', NULL,
  'An online forum for business owners and corporate officers covering corporate compliance, commercial contract best practices, and regulatory updates under the Revised Corporation Code.',
  true),

('e3', 'Immigration Law Update: Work Visas and AEP Processing', '2026-11-08', '10:00 AM – 1:00 PM', 'Westwood Law Firm, Suite 1004 Atlanta Center, San Juan City', 'In-Person', 'Atty. Lorraine A. Dela Cruz', NULL,
  'A practical workshop on Philippine immigration requirements for foreign nationals, covering visa options, Alien Employment Permit processing, and recent Bureau of Immigration updates.',
  true)
ON CONFLICT (id) DO NOTHING;

-- The events page reads date / time / speaker, and "upcoming" filters on date.
-- The seed above writes event_date / event_time / speaker_name, so mirror them.
UPDATE public.seminar_events SET
  date    = COALESCE(date, event_date::TIMESTAMPTZ),
  time    = COALESCE(time, event_time),
  speaker = COALESCE(speaker, speaker_name)
WHERE event_date IS NOT NULL OR event_time IS NOT NULL OR speaker_name IS NOT NULL;

-- ============================================================================
-- Retainer Packages
-- ============================================================================

INSERT INTO public.retainer_packages (id, name, tagline, price_display, features, cta_text, is_highlighted, display_order, is_active) VALUES
('essential', 'Essential', 'Foundational legal support for growing businesses', 'Demo pricing — contact for quote',
  to_jsonb(ARRAY['2 legal consultations per month', 'Basic contract review (up to 3 per month)', 'Labor compliance guidance', 'Email legal inquiries (48-hour response)', 'Access to Westwood Legal Updates']),
  'Discuss Retainer', false, 1, true),

('business', 'Business', 'Comprehensive support for established businesses', 'Demo pricing — contact for quote',
  to_jsonb(ARRAY['5 legal consultations per month', 'Contract review and drafting (up to 8 per month)', 'Labor and employment advisory', 'Corporate compliance support', 'Priority response (24 hours)', 'Quarterly legal risk review', 'Dedicated relationship lawyer']),
  'Discuss Retainer', true, 2, true),

('corporate', 'Corporate', 'Full-service legal partnership for corporations', 'Demo pricing — contact for quote',
  to_jsonb(ARRAY['Unlimited consultations', 'Comprehensive contract management', 'Multi-practice area support', 'Litigation monitoring and support', 'Priority response (same day)', 'Monthly legal health review', 'Dedicated senior lawyer', 'Partner network access']),
  'Discuss Retainer', false, 3, true)
ON CONFLICT (id) DO NOTHING;

COMMIT;
