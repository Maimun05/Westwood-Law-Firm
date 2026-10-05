// ============================================================================
// CONTENT DATABASE QUERIES
// ============================================================================
// Functions to fetch content from database instead of mockData.ts
// Single source of truth for all public-facing content

import { supabase } from "./supabase";
import {
  fallbackArticles,
  fallbackCorporateClients,
  fallbackFAQs,
  fallbackLawyers,
  fallbackPracticeAreas,
  fallbackRetainerPackages,
  fallbackSeminars,
  fallbackSpecialists,
} from "./fallbackContent";

// The fallback (mock) content is used ONLY when the request itself fails —
// e.g. the table is missing, RLS denies the read, or the network is down.
// An empty table is a valid answer and must never be masked with mock data,
// otherwise the site looks populated while the database is actually empty.
// (This is what made "Our Lawyers" show the wrong count before.)

// ============================================================================
// TYPES
// ============================================================================

export interface PracticeArea {
  id: string;
  name: string;
  slug: string;
  description: string;
  icon: string;
  color: string;
  is_active: boolean;
  display_order: number;
  services?: string[];
  client_needs?: string[];
  related_matters?: string[];
  lawyer_ids?: string[];
}

export interface Lawyer {
  id: string;
  email: string;
  full_name: string;
  phone: string | null;
  address: string | null;
  city: string | null;
  date_of_birth: string | null;
  role: "client" | "lawyer" | "admin";
  is_active: boolean;
  position: string | null;
  bio: string | null;
  education: any;
  bar_admissions: any;
  experience_years: number | null;
  profile_image: string | null;
  linkedin_url: string | null;
  display_order: number;
  created_at: string;
  updated_at: string;
  practice_areas?: PracticeArea[];
}

export interface Article {
  id: string;
  title: string;
  slug: string;
  excerpt: string;
  content: string;
  author_id: string | null;
  category: string;
  cover_image: string | null;
  reading_time: string;
  is_published: boolean;
  published_at: string | null;
  view_count: number;
  created_at: string;
  updated_at: string;
  author?: {
    id: string;
    full_name: string;
    profile_image: string | null;
  };
}

export interface Specialist {
  id: string;
  name: string;
  title: string;
  specialty: string;
  organization: string;
  email: string;
  phone: string | null;
  bio: string;
  image_url: string | null;
  is_active: boolean;
  display_order: number;
  specialist_type: string;
  services_supported: string[];
  connected_practice_areas: string[];
  industry: string;
  location: string;
  description: string;
  created_at: string;
  updated_at: string;
}

export interface CorporateClient {
  id: string;
  name: string;
  logo_url: string | null;
  is_active: boolean;
  display_order: number;
  created_at: string;
}

export interface FAQ {
  id: string;
  question: string;
  answer: string;
  category: string;
  is_active: boolean;
  display_order: number;
  created_at: string;
  updated_at: string;
}

export interface SeminarEvent {
  id: string;
  title: string;
  description: string;
  date: string;
  location: string;
  speaker: string;
  speaker_name: string;
  speaker_profile_id: string | null;
  capacity: number | null;
  registration_url: string | null;
  is_active: boolean;
  mode: "In-Person" | "Online";
  time: string;
  is_published: boolean;
  created_at: string;
  updated_at: string;
}

export interface RetainerPackage {
  id: string;
  name: string;
  description: string;
  price: string;
  price_display: string;
  features: string[];
  is_active: boolean;
  display_order: number;
  cta_text: string;
  is_highlighted: boolean;
  created_at: string;
  updated_at: string;
  tagline: string | null;
}

// ============================================================================
// PRACTICE AREAS
// ============================================================================

export async function getPracticeAreas(): Promise<{
  data: PracticeArea[] | null;
  error: string | null;
}> {
  try {
    const { data, error } = await supabase
      .from("practice_areas")
      .select("*")
      .eq("is_active", true)
      .order("display_order", { ascending: true });

    if (error) throw error;
    return { data: (data ?? []) as PracticeArea[], error: null };
  } catch (error: any) {
    return { data: fallbackPracticeAreas, error: error.message };
  }
}

export async function getPracticeAreaBySlug(
  slug: string,
): Promise<{ data: PracticeArea | null; error: string | null }> {
  try {
    const { data, error } = await supabase
      .from("practice_areas")
      .select("*")
      .eq("slug", slug)
      .eq("is_active", true)
      .single();

    if (error) throw error;
    return {
      data: data
        ? (data as PracticeArea)
        : (fallbackPracticeAreas.find((area) => area.slug === slug) ?? null),
      error: null,
    };
  } catch (error: any) {
    return {
      data: fallbackPracticeAreas.find((area) => area.slug === slug) ?? null,
      error: error.message,
    };
  }
}

// ============================================================================
// LAWYERS
// ============================================================================

const LAWYER_VIEW = "public_lawyers";

function toLawyer(row: any): Lawyer {
  return {
    ...row,
    phone: null,
    address: null,
    date_of_birth: null,
    role: "lawyer",
    is_active: true,
    email: row.email ?? "",
    practice_areas: Array.isArray(row.practice_areas) ? row.practice_areas : [],
  } as Lawyer;
}

// Served from the public_lawyers view (safe columns only, readable by visitors).
// The mock lawyers are used only if the request itself fails, never to mask an empty table.
export async function getLawyers(): Promise<{
  data: Lawyer[] | null;
  error: string | null;
}> {
  try {
    const { data, error } = await supabase
      .from(LAWYER_VIEW)
      .select("*")
      .order("display_order", { ascending: true });
    if (error) throw error;
    return { data: (data || []).map(toLawyer), error: null };
  } catch (error: any) {
    return { data: fallbackLawyers, error: error.message };
  }
}

export async function getLawyerById(
  id: string,
): Promise<{ data: Lawyer | null; error: string | null }> {
  try {
    const { data, error } = await supabase.from(LAWYER_VIEW).select("*").eq("id", id).maybeSingle();
    if (error) throw error;
    return { data: data ? toLawyer(data) : null, error: null };
  } catch (error: any) {
    return {
      data: fallbackLawyers.find((item) => item.id === id) ?? null,
      error: error.message,
    };
  }
}

export async function getLawyersByPracticeArea(
  practiceAreaId: string,
): Promise<{ data: Lawyer[] | null; error: string | null }> {
  const { data, error } = await getLawyers();
  return {
    data: (data || []).filter((lawyer) =>
      lawyer.practice_areas?.some((area) => area.id === practiceAreaId),
    ),
    error,
  };
}

// ============================================================================
// ARTICLES
// ============================================================================

export async function getPublishedArticles(): Promise<{
  data: Article[] | null;
  error: string | null;
}> {
  try {
    const { data, error } = await supabase
      .from("articles")
      .select(`
        *,
        author:profiles!author_id (
          id,
          full_name,
          profile_image
        )
      `)
      .eq("is_published", true)
      .order("published_at", { ascending: false });

    if (error) throw error;
    return { data: (data ?? []) as Article[], error: null };
  } catch (error: any) {
    return { data: fallbackArticles, error: error.message };
  }
}

export async function getArticleById(
  id: string,
): Promise<{ data: Article | null; error: string | null }> {
  try {
    const { data, error } = await supabase
      .from("articles")
      .select(`
        *,
        author:profiles!author_id (
          id,
          full_name,
          profile_image
        )
      `)
      .eq("id", id)
      .eq("is_published", true)
      .single();

    if (error) throw error;

    // Increment view count
    await supabase
      .from("articles")
      .update({ view_count: (data.view_count || 0) + 1 })
      .eq("id", id);

    return {
      data: data
        ? (data as Article)
        : (fallbackArticles.find((article) => article.id === id) ?? null),
      error: null,
    };
  } catch (error: any) {
    return {
      data: fallbackArticles.find((article) => article.id === id) ?? null,
      error: error.message,
    };
  }
}

export async function getArticlesByCategory(
  category: string,
): Promise<{ data: Article[] | null; error: string | null }> {
  try {
    const { data, error } = await supabase
      .from("articles")
      .select(`
        *,
        author:profiles!author_id (
          id,
          full_name,
          profile_image
        )
      `)
      .eq("category", category)
      .eq("is_published", true)
      .order("published_at", { ascending: false });

    if (error) throw error;
    return { data: (data ?? []) as Article[], error: null };
  } catch (error: any) {
    return {
      data: fallbackArticles.filter((article) => article.category === category),
      error: error.message,
    };
  }
}

// ============================================================================
// SPECIALISTS
// ============================================================================

export async function getSpecialists(): Promise<{
  data: Specialist[] | null;
  error: string | null;
}> {
  try {
    const { data, error } = await supabase
      .from("specialists")
      .select("*")
      .eq("is_active", true)
      .order("display_order", { ascending: true });

    if (error) throw error;
    return { data: (data ?? []) as Specialist[], error: null };
  } catch (error: any) {
    return { data: fallbackSpecialists, error: error.message };
  }
}

// ============================================================================
// CORPORATE CLIENTS
// ============================================================================

export async function getCorporateClients(): Promise<{
  data: CorporateClient[] | null;
  error: string | null;
}> {
  try {
    const { data, error } = await supabase
      .from("corporate_clients")
      .select("*")
      .eq("is_active", true)
      .order("display_order", { ascending: true });

    if (error) throw error;
    return { data: (data ?? []) as CorporateClient[], error: null };
  } catch (error: any) {
    return { data: fallbackCorporateClients, error: error.message };
  }
}

// ============================================================================
// FAQS
// ============================================================================

export async function getFAQs(
  category?: string,
): Promise<{ data: FAQ[] | null; error: string | null }> {
  try {
    let query = supabase
      .from("faqs")
      .select("*")
      .eq("is_active", true)
      .order("display_order", { ascending: true });

    if (category) {
      query = query.eq("category", category);
    }

    const { data, error } = await query;

    if (error) throw error;
    return { data: (data ?? []) as FAQ[], error: null };
  } catch (error: any) {
    return {
      data: fallbackFAQs.filter((faq) => !category || faq.category === category),
      error: error.message,
    };
  }
}

// ============================================================================
// SEMINAR EVENTS
// ============================================================================

export async function getUpcomingSeminars(): Promise<{
  data: SeminarEvent[] | null;
  error: string | null;
}> {
  try {
    const { data, error } = await supabase
      .from("seminar_events")
      .select("*")
      // is_published, not is_active: the admin ContentManager publishes on
      // is_published (and the seed writes it), so filtering on is_active here
      // meant the Website Content toggle did nothing on the public site.
      .eq("is_published", true)
      .gte("date", new Date().toISOString())
      .order("date", { ascending: true });

    if (error) throw error;
    return { data: (data ?? []) as SeminarEvent[], error: null };
  } catch (error: any) {
    return { data: fallbackSeminars, error: error.message };
  }
}

// ============================================================================
// RETAINER PACKAGES
// ============================================================================

export async function getRetainerPackages(): Promise<{
  data: RetainerPackage[] | null;
  error: string | null;
}> {
  try {
    const { data, error } = await supabase
      .from("retainer_packages")
      .select("*")
      .eq("is_active", true)
      .order("display_order", { ascending: true });

    if (error) throw error;
    return { data: (data ?? []) as RetainerPackage[], error: null };
  } catch (error: any) {
    return { data: fallbackRetainerPackages, error: error.message };
  }
}
