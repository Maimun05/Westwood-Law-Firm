import type {
  Article,
  CorporateClient,
  FAQ,
  Lawyer,
  PracticeArea,
  RetainerPackage,
  SeminarEvent,
  Specialist,
} from "./content";

const now = "2026-09-01T00:00:00.000Z";

export const fallbackPracticeAreas: PracticeArea[] = [
  [
    "labor",
    "Labor and Industrial Relations",
    "Expert guidance on employment, labor disputes, and industrial relations.",
    "⚖️",
  ],

  [
    "banking",
    "Banking Laws",
    "Legal support for financial institutions, loans, and regulatory compliance.",
    "🏦",
  ],

  [
    "asset-recovery",
    "Asset Recovery",
    "Strategies for recovering assets, enforcing judgments, and pursuing claims.",
    "🔍",
  ],

  [
    "corporate",
    "Corporate and Commercial Laws",
    "Support for incorporation, governance, contracts, and commercial transactions.",
    "🏢",
  ],

  [
    "civil",
    "Civil and Administrative Matters",
    "Representation before courts, administrative agencies, and government bodies.",
    "🔨",
  ],

  [
    "criminal",
    "Criminal Cases",
    "Defense and prosecution representation in criminal matters.",
    "🛡️",
  ],

  [
    "immigration",
    "Immigration",
    "Visa, residency, employment permit, and naturalization support.",
    "🌏",
  ],

  [
    "annulment",
    "Annulment of Marriages",
    "Confidential representation for annulment and family law matters.",
    "⚖️",
  ],

  [
    "cooperatives",
    "Cooperatives",
    "Registration, governance, and compliance services for cooperatives.",
    "🤝",
  ],

  [
    "energy",
    "Energy",
    "Regulatory advisory for power, utilities, and renewable energy projects.",
    "⚡",
  ],

  [
    "mining",
    "Mining",
    "Permit, contract, environmental, and regulatory support for mining clients.",
    "⛏️",
  ],

  [
    "taxation",
    "Taxation",
    "Tax planning, BIR compliance, estate planning, and assessment defense.",
    "📋",
  ],
].map(([id, name, description, icon], index) => ({
  id,

  name,

  slug: id,

  description,

  icon,

  color: "#c49d3f",

  is_active: true,

  display_order: index + 1,

  services: ["Consultation", "Document review", "Representation", "Compliance advisory"],

  client_needs: ["Clear legal guidance", "Practical next steps", "Trusted representation"],

  related_matters: [],

  lawyer_ids: [],
}));

const lawyerSeed = [
  [
    "l1",
    'Atty. Ernesto "Boyet" Tabao',
    "Managing Partner",
    "/lawyers/atty-tabao-primary.png",
    "atty.boyet@westwoodlaw.ph",
    "Labor, industrial relations, corporate, and business law practitioner.",
  ],

  [
    "l2",
    "Atty. Maria Cristina L. Santos",
    "Senior Associate",
    "https://images.unsplash.com/photo-1662104935883-e9dd0619eaba?w=400&h=500&fit=crop&auto=format",
    "mc.santos@westwoodlaw.ph",
    "Civil and administrative matters practitioner with litigation experience.",
  ],

  [
    "l3",
    "Atty. Benjamin Jose T. Reyes",
    "Associate",
    "https://images.unsplash.com/photo-1560250097-0b93528c311a?w=400&h=500&fit=crop&auto=format",
    "bj.reyes@westwoodlaw.ph",
    "Corporate and commercial law practitioner focused on business matters.",
  ],

  [
    "l4",
    "Atty. Lorraine A. Dela Cruz",
    "Associate",
    "https://images.unsplash.com/photo-1614786269829-d24616faf56d?w=400&h=500&fit=crop&auto=format",
    "l.delacruz@westwoodlaw.ph",
    "Immigration practitioner handling visas and residency documentation.",
  ],

  [
    "l5",
    "Atty. Carlos Gabriel M. Torres",
    "Associate",
    "https://images.unsplash.com/photo-1534030347209-467a5b0ad3e6?w=400&h=500&fit=crop&auto=format",
    "cg.torres@westwoodlaw.ph",
    "Taxation and banking law practitioner advising businesses and families.",
  ],

  [
    "l6",
    "Atty. Sofia Isabelle B. Mendoza",
    "Associate",
    "https://images.unsplash.com/photo-1662104935762-707db0439ecd?w=400&h=500&fit=crop&auto=format",
    "si.mendoza@westwoodlaw.ph",
    "Family law practitioner focused on sensitive annulment matters.",
  ],

  [
    "l7",
    "Atty. Marco Antonio R. Villanueva",
    "Associate",
    "https://images.unsplash.com/photo-1613496701765-97267d26e3df?w=400&h=500&fit=crop&auto=format",
    "ma.villanueva@westwoodlaw.ph",
    "Energy, mining, cooperatives, and regulatory compliance practitioner.",
  ],
];

export const fallbackLawyers: Lawyer[] = lawyerSeed.map(
  ([id, full_name, position, profile_image, email, bio], index) => ({
    id,

    email,

    full_name,

    phone: null,

    address: null,

    city: "San Juan City, Philippines",

    date_of_birth: null,

    role: "lawyer",

    is_active: true,

    position,

    bio,

    education: [],

    bar_admissions: [],

    experience_years: null,

    profile_image,

    linkedin_url: null,

    display_order: index + 1,

    created_at: now,

    updated_at: now,

    practice_areas: [],
  }),
);

const articleSeed = [
  [
    "a1",
    "Understanding the Labor Code: Rights and Obligations",
    "Labor and Industrial Relations",
    "The Labor Code provides the framework for employment relationships in the Philippines.",
  ],

  [
    "a2",
    "Corporate Formation in the Philippines",
    "Corporate and Commercial Laws",
    "A practical guide to SEC, BIR, and local registration requirements.",
  ],

  [
    "a3",
    "Philippine Immigration: Visa Options",
    "Immigration",
    "An overview of work visas, investor residency, and related requirements.",
  ],

  [
    "a4",
    "Estate Planning Under Philippine Law",
    "Taxation",
    "A well-structured plan can protect families and reduce avoidable disputes.",
  ],

  [
    "a5",
    "Annulment of Marriage in the Philippines",
    "Annulment of Marriages",
    "An overview of grounds, process, and realistic timelines.",
  ],

  [
    "a6",
    "Energy Regulatory Commission Compliance Guide",
    "Energy",
    "Key compliance areas for independent power producers and utilities.",
  ],
];

export const fallbackArticles: Article[] = articleSeed.map(
  ([id, title, category, excerpt], index) => ({
    id,

    title,

    slug: id,

    excerpt,

    content: excerpt,

    author_id: fallbackLawyers[index % fallbackLawyers.length].id,

    category,

    cover_image: null,

    reading_time: `${5 + (index % 3)} min read`,

    is_published: true,

    published_at: `2026-0${Math.min(index + 5, 9)}-05T00:00:00.000Z`,

    view_count: 0,

    created_at: now,

    updated_at: now,

    author: {
      id: fallbackLawyers[index % fallbackLawyers.length].id,

      full_name: fallbackLawyers[index % fallbackLawyers.length].full_name,

      profile_image: fallbackLawyers[index % fallbackLawyers.length].profile_image,
    },
  }),
);

export const fallbackSpecialists: Specialist[] = [
  ["s1", "Klassic Solutions Inc.", "Manpower & Support Services", "Human Resources & Manpower"],

  ["s2", "Accountants and Tax Experts", "Accountancy & Tax Services", "Accounting & Finance"],

  ["s3", "Klassic Marketing Inc.", "Marketing & Business Development", "Marketing & Advertising"],

  [
    "s4",
    "Brains Infinite Innovations Inc.",
    "Marketing & Innovative Solutions",
    "Marketing & Technology",
  ],
].map(([id, name, specialty, industry], index) => ({
  id,

  name,

  title: specialty,

  specialty,

  organization: name,

  email: "",

  phone: null,

  bio: `${name} is part of the Westwood partner network.`,

  image_url: null,

  is_active: true,

  display_order: index + 1,

  specialist_type: specialty,

  services_supported: [],

  connected_practice_areas: [],

  industry,

  location: "Metro Manila, Philippines",

  description: `${name} provides complementary professional support for Westwood clients.`,

  created_at: now,

  updated_at: now,
}));

const clientNames = [
  "Club Filipino",
  "Citibeds Inc.",
  "Nurture Spa",
  "Citibank",
  "Philippine Savings Bank",
  "Virginia Foods Inc.",
  "D&L Industries Inc.",
  "Power One Corporation",
];

export const fallbackCorporateClients: CorporateClient[] = clientNames.map((name, index) => ({
  id: `cc${index + 1}`,
  name,
  logo_url: null,
  is_active: true,
  display_order: index + 1,
  created_at: now,
}));

export const fallbackFAQs: FAQ[] = [
  [
    "How do I schedule a consultation?",
    "Complete the consultation form or contact the Westwood office directly.",
  ],

  [
    "Can I consult online or by phone?",
    "Yes. Video, phone, email, and in-person consultations are available.",
  ],

  [
    "Is submitting an inquiry the same as retaining a lawyer?",
    "No. An attorney-client relationship begins only after a formal engagement agreement.",
  ],

  [
    "How is my information kept confidential?",
    "Westwood treats client communications and submitted information confidentially.",
  ],
].map(([question, answer], index) => ({
  id: `faq${index + 1}`,
  question,
  answer,
  category: "General",
  is_active: true,
  display_order: index + 1,
  created_at: now,
  updated_at: now,
}));

export const fallbackSeminars: SeminarEvent[] = [
  [
    "e1",
    "Labor Law and Industrial Relations Seminar",
    "October 15, 2026",
    "9:00 AM - 12:00 PM",
    "In-Person",
    'Atty. Ernesto "Boyet" Tabao',
  ],

  [
    "e2",
    "Corporate Compliance and Business Law Forum",
    "October 22, 2026",
    "2:00 PM - 5:00 PM",
    "Online",
    "Atty. Maria Cristina L. Santos",
  ],
].map(([id, title, date, time, mode, speaker], index) => ({
  id,
  title,
  description: "A practical Westwood legal education event.",
  date,
  location: mode === "Online" ? "Online (Zoom)" : "Westwood Law Firm, San Juan City",
  speaker,
  speaker_name: speaker,
  speaker_profile_id: fallbackLawyers[index].id,
  capacity: null,
  registration_url: null,
  is_active: true,
  mode: mode as SeminarEvent["mode"],
  time,
  is_published: true,
  created_at: now,
  updated_at: now,
}));

export const fallbackRetainerPackages: RetainerPackage[] = [
  [
    "essential",
    "Essential",
    "Foundational legal support for growing businesses",
    "2 consultations per month; basic contract review; labor compliance guidance",
  ],

  [
    "business",
    "Business",
    "Comprehensive support for established businesses",
    "5 consultations per month; contract review; corporate compliance support",
  ],

  [
    "corporate",
    "Corporate",
    "Full-service legal partnership for corporations",
    "Unlimited consultations; contract management; multi-practice support",
  ],
].map(([id, name, description, featureText], index) => ({
  id,
  name,
  description,
  tagline: null,
  price: "Contact for quote",
  price_display: "Contact for quote",
  features: featureText.split("; "),
  is_active: true,
  display_order: index + 1,
  cta_text: "Discuss Retainer",
  is_highlighted: index === 1,
  created_at: now,
  updated_at: now,
}));
