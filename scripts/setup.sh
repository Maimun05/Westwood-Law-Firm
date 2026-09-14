#!/bin/bash
# =============================================================================
# Westwood Law Firm - Automated Setup Script
# =============================================================================
# This script automates the initial setup for development
# Run with: bash scripts/setup.sh
# =============================================================================

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}╔═══════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║     Westwood Law Firm - Automated Development Setup             ║${NC}"
echo -e "${BLUE}╚═══════════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Check prerequisites
check_command() {
    if ! command -v $1 &> /dev/null; then
        echo -e "${RED}❌ $1 is not installed. Please install it first.${NC}"
        exit 1
    else
        echo -e "${GREEN}✅ $1 found${NC}"
    fi
}

echo -e "${YELLOW}📋 Checking prerequisites...${NC}"
check_command node
check_command npm
check_command git
check_command supabase

# Check Node version
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo -e "${RED}❌ Node.js 18+ required. Current: $(node -v)${NC}"
    exit 1
fi
echo -e "${GREEN}✅ Node.js $(node -v)${NC}"

# Install dependencies
echo -e "${YELLOW}📦 Installing dependencies...${NC}"
if command -v pnpm &> /dev/null; then
    pnpm install
else
    npm install
fi
echo -e "${GREEN}✅ Dependencies installed${NC}"

# Setup environment file
echo -e "${YELLOW}⚙️  Setting up environment...${NC}"
if [ ! -f .env.local ]; then
    cp .env.example .env.local
    echo -e "${GREEN}✅ Created .env.local from .env.example${NC}"
    echo -e "${YELLOW}⚠️  Please edit .env.local with your Supabase credentials${NC}"
else
    echo -e "${GREEN}✅ .env.local already exists${NC}"
fi

# Start Supabase locally (optional)
echo ""
echo -e "${YELLOW}🗄️  Database Setup${NC}"
echo "Choose database option:"
echo "  1) Local Supabase (recommended for development)"
echo "  2) Remote Supabase (already configured in .env.local)"
echo "  3) Skip database setup"
read -p "Enter choice [1-3]: " DB_CHOICE

case $DB_CHOICE in
    1)
        echo -e "${YELLOW}🚀 Starting local Supabase...${NC}"
        supabase start
        
        echo -e "${YELLOW}📊 Applying production schema...${NC}"
        supabase db push --file supabase/schema-production.sql
        
        echo -e "${YELLOW}🌱 Seeding content data...${NC}"
        supabase db push --file supabase/migrations/20260919_seed_content.sql
        
        echo -e "${GREEN}✅ Local database ready${NC}"
        echo -e "${BLUE}   Studio: http://localhost:54323${NC}"
        echo -e "${BLUE}   API: http://localhost:54321${NC}"
        echo -e "${BLUE}   DB: postgresql://postgres:postgres@localhost:54322/postgres${NC}"
        ;;
    2)
        echo -e "${YELLOW}📡 Using remote Supabase...${NC}"
        echo "Please ensure you've run schema-production.sql in your remote Supabase SQL Editor"
        ;;
    3)
        echo -e "${YELLOW}⏭️  Skipping database setup${NC}"
        ;;
    *)
        echo -e "${RED}Invalid choice${NC}"
        exit 1
        ;;
esac

# Generate TypeScript types
echo -e "${YELLOW}🔧 Generating TypeScript types...${NC}"
if [ "$DB_CHOICE" = "1" ]; then
    supabase gen types typescript --local > src/lib/database.types.ts
else
    # For remote, you'd need to run this manually with --project-ref
    echo -e "${YELLOW}⚠️  For remote DB, run manually:${NC}"
    echo "supabase gen types typescript --project-ref YOUR_REF > src/lib/database.types.ts"
fi
echo -e "${GREEN}✅ Types generated${NC}"

# Build check
echo -e "${YELLOW}🔨 Running build check...${NC}"
npm run build
echo -e "${GREEN}✅ Build successful${NC}"

# Summary
echo ""
echo -e "${BLUE}╔═══════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║                        Setup Complete!                            ║${NC}"
echo -e "${BLUE}╚═══════════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${GREEN}Next steps:${NC}"
echo "  1. Edit .env.local with your Supabase credentials"
echo "  2. Run 'npm run dev' to start development server"
echo "  3. Open http://localhost:5173"
echo ""
echo -e "${YELLOW}Important:${NC}"
echo "  • Deploy supabase/functions/admin-create-user/ as Edge Function"
echo "  • Set SUPABASE_SERVICE_ROLE_KEY in Supabase Dashboard → Edge Functions → Secrets"
echo "  • Create first admin: UPDATE profiles SET role='admin' WHERE email='your@email.com';"
echo ""
echo -e "${BLUE}Documentation:${NC}"
echo "  • supabase/README.md - Full schema docs"
echo "  • supabase/PRODUCTION_DEPLOYMENT.md - Production deployment guide"
echo "  • supabase/SECURITY_AUDIT.md - Security review"
echo ""