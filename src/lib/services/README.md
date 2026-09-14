# Supabase Services Documentation

Quick reference for using Supabase services in your components.

## Authentication

```typescript
import { signUp, signIn, signOut, getCurrentUserProfile } from "@/lib/auth";
import { useAuth } from "@/hooks/useAuth";

// In a component
function MyComponent() {
  const { user, loading } = useAuth();

  // user will be null if not logged in
  // user.role will be 'client', 'lawyer', or 'admin'
}

// Sign up
const { data, error } = await signUp(email, password, fullName, phone);

// Sign in
const { data, error } = await signIn(email, password);

// Sign out
await signOut();

// Get current user
const user = await getCurrentUserProfile();
```

## Inquiries

```typescript
import { createInquiry, getUserInquiries, getAllInquiries } from "@/lib/services/inquiries";

// Submit inquiry (public, no auth required)
const { data, error } = await createInquiry({
  name: "John Doe",
  email: "john@example.com",
  phone: "+63 912 345 6789",
  practiceArea: "Labor",
  preferredLawyer: "Atty. Smith", // optional
  subject: "Employment Dispute",
  message: "I need help with...",
});

// Get user's inquiries (requires auth)
const { data, error } = await getUserInquiries();

// Get all inquiries (admin/lawyer only)
const { data, error } = await getAllInquiries();
```

## Lawyers

```typescript
import {
  getActiveLawyers,
  getLawyerById,
  getLawyersBySpecialization,
  saveLawyer,
  unsaveLawyer,
  getSavedLawyers,
} from "@/lib/services/lawyers";

// Get all active lawyers
const { data: lawyers, error } = await getActiveLawyers();

// Get specific lawyer
const { data: lawyer, error } = await getLawyerById("lawyer-id");

// Filter by specialization
const { data: lawyers, error } = await getLawyersBySpecialization("Corporate Law");

// Save lawyer to favorites (requires auth)
await saveLawyer("lawyer-id");

// Remove from favorites
await unsaveLawyer("lawyer-id");

// Get saved lawyers
const { data: savedLawyers, error } = await getSavedLawyers();
```

## Matters

```typescript
import {
  getClientMatters,
  getLawyerMatters,
  getAllMatters,
  getMatterById,
  updateMatterStatus,
  assignLawyerToMatter,
  createMatter,
} from "@/lib/services/matters";

// Get matters based on role
const { data, error } = await getClientMatters(); // client view
const { data, error } = await getLawyerMatters(); // lawyer view
const { data, error } = await getAllMatters(); // admin view

// Get specific matter
const { data: matter, error } = await getMatterById("matter-id");

// Update status (admin/lawyer only)
await updateMatterStatus("matter-id", "Active");

// Assign lawyer (admin only)
await assignLawyerToMatter("matter-id", "lawyer-id");

// Create matter (admin only)
const { data, error } = await createMatter({
  clientId: "client-id",
  practiceArea: "Corporate Law",
  title: "Business Registration",
  description: "Help with incorporation",
  priority: "High", // optional
});
```

## File Upload

```typescript
import { supabase } from "@/lib/supabase";

// Upload document
async function uploadDocument(matterId: string, file: File) {
  // 1. Upload file to storage
  const filePath = `${matterId}/${Date.now()}_${file.name}`;
  const { data: uploadData, error: uploadError } = await supabase.storage
    .from("documents")
    .upload(filePath, file);

  if (uploadError) throw uploadError;

  // 2. Create document record in database
  const { data, error } = await supabase
    .from("documents")
    .insert({
      matter_id: matterId,
      name: file.name,
      file_path: filePath,
      file_type: file.type,
      file_size: file.size,
      access_level: "Client & Assigned Lawyer",
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

// Download document
async function downloadDocument(filePath: string) {
  const { data, error } = await supabase.storage.from("documents").download(filePath);

  if (error) throw error;

  // Create download link
  const url = URL.createObjectURL(data);
  const a = document.createElement("a");
  a.href = url;
  a.download = filePath.split("/").pop() || "download";
  a.click();
}

// Get public URL (for lawyer photos)
function getPublicUrl(bucket: string, path: string) {
  const { data } = supabase.storage.from(bucket).getPublicUrl(path);

  return data.publicUrl;
}
```

## Real-time Subscriptions

```typescript
import { supabase } from "@/lib/supabase";
import { useEffect } from "react";

// Subscribe to matter updates
useEffect(() => {
  const channel = supabase
    .channel("matters-changes")
    .on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "matters",
        filter: `client_id=eq.${userId}`,
      },
      (payload) => {
        console.log("Matter updated:", payload.new);
        // Update your state
      },
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}, [userId]);
```

## Error Handling

All service functions return `{ data, error }` format:

```typescript
const { data, error } = await someFunction();

if (error) {
  // Handle error
  console.error(error);
  setErrorMessage(error);
  return;
}

// Use data
console.log(data);
```

## Access Control

The database automatically enforces access control via RLS policies:

### Clients can:

- ✅ View their own matters
- ✅ View their own inquiries
- ✅ Upload documents to their matters
- ✅ View documents based on access level
- ✅ Save lawyers
- ❌ View other clients' data
- ❌ View all inquiries
- ❌ Assign lawyers

### Lawyers can:

- ✅ View assigned matters
- ✅ View all inquiries
- ✅ Upload documents to assigned matters
- ✅ Update matter status
- ❌ View unassigned matters
- ❌ View "Lawyer Only" documents from other lawyers
- ❌ Create matters

### Admins can:

- ✅ View all data
- ✅ Create and manage matters
- ✅ Assign lawyers
- ✅ View audit logs
- ✅ Manage users
- ✅ Everything

## Common Patterns

### Loading State

```typescript
const [data, setData] = useState(null);
const [loading, setLoading] = useState(true);
const [error, setError] = useState(null);

useEffect(() => {
  async function load() {
    setLoading(true);
    const { data, error } = await fetchData();
    if (error) setError(error);
    else setData(data);
    setLoading(false);
  }
  load();
}, []);

if (loading) return <LoadingSpinner />;
if (error) return <ErrorMessage error={error} />;
return <div>{/* Render data */}</div>;
```

### Optimistic Updates

```typescript
async function updateStatus(id: string, newStatus: string) {
  // Update UI immediately
  setMatters((prev) => prev.map((m) => (m.id === id ? { ...m, status: newStatus } : m)));

  // Update server
  const { error } = await updateMatterStatus(id, newStatus);

  // Revert if failed
  if (error) {
    setMatters((prev) => prev.map((m) => (m.id === id ? { ...m, status: oldStatus } : m)));
    showError(error);
  }
}
```

### Pagination

```typescript
const PAGE_SIZE = 20;

const { data, error } = await supabase
  .from("matters")
  .select("*")
  .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)
  .order("created_at", { ascending: false });
```

## TypeScript Types

All types are defined in `src/lib/database.types.ts`:

```typescript
import type { Database } from "@/lib/database.types";

type Matter = Database["public"]["Tables"]["matters"]["Row"];
type InsertMatter = Database["public"]["Tables"]["matters"]["Insert"];
type UpdateMatter = Database["public"]["Tables"]["matters"]["Update"];
```

## Environment Variables

Required in `.env`:

```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

Never commit these to git!
