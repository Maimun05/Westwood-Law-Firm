-- ============================================================================
-- CONTENT MANAGEMENT TABLES
-- ============================================================================
-- Move all mockData.ts content to database tables
-- This includes lawyers, practice areas, articles, specialists, etc.

-- ============================================================================
-- PRACTICE AREAS
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.practice_areas (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  description TEXT NOT NULL,
  icon TEXT NOT NULL, -- Icon name/emoji
  color TEXT NOT NULL, -- Tailwind color class
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.practice_areas ENABLE ROW LEVEL SECURITY;

-- Public can view active practice areas
DROP POLICY IF EXISTS "practice_areas_public_select" ON public.practice_areas;
CREATE POLICY practice_areas_public_select
ON public.practice_areas FOR SELECT
TO public
USING (is_active = true);

-- Admins can manage practice areas
DROP POLICY IF EXISTS "practice_areas_admin_all" ON public.practice_areas;
CREATE POLICY practice_areas_admin_all
ON public.practice_areas FOR ALL
TO authenticated
USING (
  (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'::user_role
)
WITH CHECK (
  (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'::user_role
);

-- ============================================================================
-- ARTICLES / BLOG POSTS
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.articles (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  excerpt TEXT NOT NULL,
  content TEXT NOT NULL,
  author_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  category TEXT NOT NULL,
  cover_image TEXT,
  reading_time TEXT NOT NULL DEFAULT '5 min read',
  is_published BOOLEAN NOT NULL DEFAULT FALSE,
  published_at TIMESTAMPTZ,
  view_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.articles ENABLE ROW LEVEL SECURITY;

-- Public can view published articles
DROP POLICY IF EXISTS "articles_public_select" ON public.articles;
CREATE POLICY articles_public_select
ON public.articles FOR SELECT
TO public
USING (is_published = true);

-- Authenticated users can view all articles
DROP POLICY IF EXISTS "articles_authenticated_select" ON public.articles;
CREATE POLICY articles_authenticated_select
ON public.articles FOR SELECT
TO authenticated
USING (true);

-- Authors and admins can manage articles
DROP POLICY IF EXISTS "articles_author_admin_all" ON public.articles;
CREATE POLICY articles_author_admin_all
ON public.articles FOR ALL
TO authenticated
USING (
  author_id = auth.uid() 
  OR (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'::user_role
)
WITH CHECK (
  author_id = auth.uid() 
  OR (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'::user_role
);

-- ============================================================================
-- SPECIALISTS / PARTNER NETWORK
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.specialists (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  title TEXT NOT NULL,
  specialty TEXT NOT NULL,
  organization TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  bio TEXT NOT NULL,
  image_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.specialists ENABLE ROW LEVEL SECURITY;

-- Public can view active specialists
DROP POLICY IF EXISTS "specialists_public_select" ON public.specialists;
CREATE POLICY specialists_public_select
ON public.specialists FOR SELECT
TO public
USING (is_active = true);

-- Admins can manage specialists
DROP POLICY IF EXISTS "specialists_admin_all" ON public.specialists;
CREATE POLICY specialists_admin_all
ON public.specialists FOR ALL
TO authenticated
USING (
  (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'::user_role
)
WITH CHECK (
  (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'::user_role
);

-- ============================================================================
-- CORPORATE CLIENTS
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.corporate_clients (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  logo_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.corporate_clients ENABLE ROW LEVEL SECURITY;

-- Public can view active clients
DROP POLICY IF EXISTS "corporate_clients_public_select" ON public.corporate_clients;
CREATE POLICY corporate_clients_public_select
ON public.corporate_clients FOR SELECT
TO public
USING (is_active = true);

-- Admins can manage clients
DROP POLICY IF EXISTS "corporate_clients_admin_all" ON public.corporate_clients;
CREATE POLICY corporate_clients_admin_all
ON public.corporate_clients FOR ALL
TO authenticated
USING (
  (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'::user_role
)
WITH CHECK (
  (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'::user_role
);

-- ============================================================================
-- FAQS
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.faqs (
  id TEXT PRIMARY KEY,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  category TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.faqs ENABLE ROW LEVEL SECURITY;

-- Public can view active FAQs
DROP POLICY IF EXISTS "faqs_public_select" ON public.faqs;
CREATE POLICY faqs_public_select
ON public.faqs FOR SELECT
TO public
USING (is_active = true);

-- Admins can manage FAQs
DROP POLICY IF EXISTS "faqs_admin_all" ON public.faqs;
CREATE POLICY faqs_admin_all
ON public.faqs FOR ALL
TO authenticated
USING (
  (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'::user_role
)
WITH CHECK (
  (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'::user_role
);

-- ============================================================================
-- SEMINAR EVENTS
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.seminar_events (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  date TIMESTAMPTZ NOT NULL,
  location TEXT NOT NULL,
  speaker TEXT NOT NULL,
  capacity INTEGER,
  registration_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.seminar_events ENABLE ROW LEVEL SECURITY;

-- Public can view active events
DROP POLICY IF EXISTS "seminar_events_public_select" ON public.seminar_events;
CREATE POLICY seminar_events_public_select
ON public.seminar_events FOR SELECT
TO public
USING (is_active = true);

-- Admins can manage events
DROP POLICY IF EXISTS "seminar_events_admin_all" ON public.seminar_events;
CREATE POLICY seminar_events_admin_all
ON public.seminar_events FOR ALL
TO authenticated
USING (
  (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'::user_role
)
WITH CHECK (
  (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'::user_role
);

-- ============================================================================
-- RETAINER PACKAGES
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.retainer_packages (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  price TEXT NOT NULL,
  features JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.retainer_packages ENABLE ROW LEVEL SECURITY;

-- Public can view active packages
DROP POLICY IF EXISTS "retainer_packages_public_select" ON public.retainer_packages;
CREATE POLICY retainer_packages_public_select
ON public.retainer_packages FOR SELECT
TO public
USING (is_active = true);

-- Admins can manage packages
DROP POLICY IF EXISTS "retainer_packages_admin_all" ON public.retainer_packages;
CREATE POLICY retainer_packages_admin_all
ON public.retainer_packages FOR ALL
TO authenticated
USING (
  (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'::user_role
)
WITH CHECK (
  (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'::user_role
);

-- ============================================================================
-- ADD PRACTICE AREAS TO PROFILES (Many-to-Many)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.profile_practice_areas (
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  practice_area_id TEXT NOT NULL REFERENCES public.practice_areas(id) ON DELETE CASCADE,
  PRIMARY KEY (profile_id, practice_area_id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.profile_practice_areas ENABLE ROW LEVEL SECURITY;

-- Public can view
DROP POLICY IF EXISTS "profile_practice_areas_public_select" ON public.profile_practice_areas;
CREATE POLICY profile_practice_areas_public_select
ON public.profile_practice_areas FOR SELECT
TO public
USING (true);

-- Users can manage their own
DROP POLICY IF EXISTS "profile_practice_areas_own_all" ON public.profile_practice_areas;
CREATE POLICY profile_practice_areas_own_all
ON public.profile_practice_areas FOR ALL
TO authenticated
USING (profile_id = auth.uid())
WITH CHECK (profile_id = auth.uid());

-- Admins can manage all
DROP POLICY IF EXISTS "profile_practice_areas_admin_all" ON public.profile_practice_areas;
CREATE POLICY profile_practice_areas_admin_all
ON public.profile_practice_areas FOR ALL
TO authenticated
USING (
  (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'::user_role
)
WITH CHECK (
  (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'::user_role
);

-- ============================================================================
-- ADD LAWYER-SPECIFIC FIELDS TO PROFILES
-- ============================================================================
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS position TEXT,
ADD COLUMN IF NOT EXISTS bio TEXT,
ADD COLUMN IF NOT EXISTS education JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS bar_admissions JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS experience_years INTEGER,
ADD COLUMN IF NOT EXISTS profile_image TEXT,
ADD COLUMN IF NOT EXISTS linkedin_url TEXT,
ADD COLUMN IF NOT EXISTS display_order INTEGER DEFAULT 0;

-- ============================================================================
-- INDEXES FOR PERFORMANCE
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_practice_areas_active ON public.practice_areas(is_active);
CREATE INDEX IF NOT EXISTS idx_practice_areas_order ON public.practice_areas(display_order);
CREATE INDEX IF NOT EXISTS idx_articles_published ON public.articles(is_published, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_articles_author ON public.articles(author_id);
CREATE INDEX IF NOT EXISTS idx_specialists_active ON public.specialists(is_active);
CREATE INDEX IF NOT EXISTS idx_seminar_events_date ON public.seminar_events(date DESC);
CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(role) WHERE role IN ('lawyer', 'admin');

-- ============================================================================
-- TRIGGERS FOR UPDATED_AT
-- ============================================================================
DROP TRIGGER IF EXISTS practice_areas_updated_at ON public.practice_areas;
CREATE TRIGGER practice_areas_updated_at BEFORE UPDATE ON public.practice_areas
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS articles_updated_at ON public.articles;
CREATE TRIGGER articles_updated_at BEFORE UPDATE ON public.articles
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS specialists_updated_at ON public.specialists;
CREATE TRIGGER specialists_updated_at BEFORE UPDATE ON public.specialists
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS faqs_updated_at ON public.faqs;
CREATE TRIGGER faqs_updated_at BEFORE UPDATE ON public.faqs
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS seminar_events_updated_at ON public.seminar_events;
CREATE TRIGGER seminar_events_updated_at BEFORE UPDATE ON public.seminar_events
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS retainer_packages_updated_at ON public.retainer_packages;
CREATE TRIGGER retainer_packages_updated_at BEFORE UPDATE ON public.retainer_packages
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS profiles_updated_at ON public.profiles;
CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
