# Supabase Edge Functions

## Setup

### Prerequisites

1. Install Supabase CLI: https://supabase.com/docs/guides/cli
2. Login to Supabase: `supabase login`
3. Link your project: `supabase link --project-ref YOUR_PROJECT_REF`

## Deploying Edge Functions

### 1. Deploy the admin functions

```bash
supabase functions deploy admin-create-user
supabase functions deploy admin-delete-user
```

### 2. Set required secrets

The Edge Function needs access to the service-role key:

```bash
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here
```

**IMPORTANT**: Never commit the service-role key to git!

### 3. Verify deployment

```bash
supabase functions list
```

## Functions

### admin-create-user

**Purpose**: Allows administrators to securely create new user accounts with passwords.

**Security**:

- Validates requesting user is an admin
- Uses service-role key server-side only
- Never returns passwords
- Creates both Auth user and profile

**Endpoint**: `https://YOUR_PROJECT_REF.supabase.co/functions/v1/admin-create-user`

**Request**:

```json
{
  "email": "user@example.com",
  "password": "password123",
  "fullName": "John Doe",
  "role": "client",
  "phone": "+1234567890",
  "address": "123 Main St",
  "city": "City Name",
  "dateOfBirth": "1990-01-15"
}
```

**Response (Success)**:

```json
{
  "success": true,
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "fullName": "John Doe",
    "role": "client",
    "created": true
  }
}
```

**Response (Error)**:

```json
{
  "error": "Error message"
}
```

### admin-delete-user

**Purpose**: Permanently deletes a user's Auth account (and, via cascade, their profile) using the service-role key.

**Security**:

- Validates requesting user is an admin
- Refuses to delete the requesting admin's own account
- Uses service-role key server-side only

**Endpoint**: `https://YOUR_PROJECT_REF.supabase.co/functions/v1/admin-delete-user`

**Request**:

```json
{
  "userId": "uuid-of-user-to-delete"
}
```

**Response (Success)**:

```json
{
  "success": true,
  "deleted": "uuid-of-user-to-delete"
}
```

**Response (Error)**:

```json
{
  "error": "Error message"
}
```

## Testing

Test locally with:

```bash
supabase functions serve admin-create-user
```

Then call:

```bash
curl -i --location --request POST 'http://localhost:54321/functions/v1/admin-create-user' \
  --header 'Authorization: Bearer YOUR_ANON_KEY' \
  --header 'Content-Type: application/json' \
  --data '{
    "email": "test@example.com",
    "password": "test123",
    "fullName": "Test User",
    "role": "client"
  }'
```

## Security Notes

1. The service-role key is ONLY used server-side in Edge Functions
2. Never expose the service-role key in frontend code
3. All requests are authenticated and validated
4. Passwords are never logged or returned
5. Admin permissions are verified before any operation

## Environment Variables

Edge Functions have access to:

- `SUPABASE_URL` - Automatically provided
- `SUPABASE_ANON_KEY` - Automatically provided
- `SUPABASE_SERVICE_ROLE_KEY` - Must be set via secrets
