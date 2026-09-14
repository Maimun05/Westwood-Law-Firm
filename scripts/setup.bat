@echo off
REM =============================================================================
REM Westwood Law Firm - Automated Setup Script (Windows)
REM =============================================================================
REM Run with: scripts\setup.bat
REM =============================================================================

setlocal enabledelayedexpansion

REM Colors
set RED=\033[0;31m
set GREEN=\033[0;32m
set YELLOW=\033[1;33m
set BLUE=\033[0;34m
set NC=\033[0m

echo =============================================================================
echo   Westwood Law Firm - Automated Development Setup (Windows)
echo =============================================================================
echo.

REM Check prerequisites
echo [INFO] Checking prerequisites...

where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not installed. Please install Node.js 18+ from https://nodejs.org
    exit /b 1
)
echo [OK] Node.js found

where npm >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] npm is not installed.
    exit /b 1
)
echo [OK] npm found

where git >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Git is not installed.
    exit /b 1
)
echo [OK] Git found

where supabase >nul 2>nul
if %errorlevel% neq 0 (
    echo [WARN] Supabase CLI not found. Install with: npm install -g supabase
    echo [WARN] Continuing without Supabase CLI...
    set HAS_SUPABASE=0
) else (
    echo [OK] Supabase CLI found
    set HAS_SUPABASE=1
)

REM Check Node version
for /f "tokens=2 delims=v." %%a in ('node -v') do set NODE_MAJOR=%%a
if !NODE_MAJOR! LSS 18 (
    echo [ERROR] Node.js 18+ required. Current: %NODE_MAJOR%
    exit /b 1
)
echo [OK] Node.js version OK

REM Install dependencies
echo.
echo [INFO] Installing dependencies...
if exist pnpm-lock.yaml (
    pnpm install
) else (
    npm install
)
echo [OK] Dependencies installed

REM Setup environment file
echo.
echo [INFO] Setting up environment...
if not exist .env.local (
    copy .env.example .env.local
    echo [OK] Created .env.local from .env.example
    echo [WARN] Please edit .env.local with your Supabase credentials
) else (
    echo [OK] .env.local already exists
)

REM Database setup
echo.
echo [INFO] Database Setup
echo Choose database option:
echo   1) Local Supabase (recommended for development)
echo   2) Remote Supabase (already configured in .env.local)
echo   3) Skip database setup
set /p DB_CHOICE=Enter choice [1-3]: 

if "%DB_CHOICE%"=="1" (
    if "%HAS_SUPABASE%"=="1" (
        echo [INFO] Starting local Supabase...
        supabase start
        
        echo [INFO] Applying production schema...
        supabase db push --file supabase/schema-production.sql
        
        echo [INFO] Seeding content data...
        supabase db push --file supabase/migrations/20260919_seed_content.sql
        
        echo [OK] Local database ready
        echo.
        echo Studio: http://localhost:54323
        echo API:    http://localhost:54321
        echo DB:     postgresql://postgres:postgres@localhost:54322/postgres
    ) else (
        echo [ERROR] Supabase CLI required for local development
        exit /b 1
    )
) else if "%DB_CHOICE%"=="2" (
    echo [INFO] Using remote Supabase...
    echo Please ensure you've run schema-production.sql in your remote Supabase SQL Editor
) else if "%DB_CHOICE%"=="3" (
    echo [INFO] Skipping database setup
) else (
    echo [ERROR] Invalid choice
    exit /b 1
)

REM Generate TypeScript types
echo.
echo [INFO] Generating TypeScript types...
if "%DB_CHOICE%"=="1" (
    supabase gen types typescript --local > src/lib/database.types.ts
    echo [OK] Types generated from local DB
) else (
    echo [WARN] For remote DB, run manually:
    echo supabase gen types typescript --project-ref YOUR_REF ^> src/lib/database.types.ts
)

REM Build check
echo.
echo [INFO] Running build check...
npm run build
echo [OK] Build successful

REM Summary
echo.
echo =============================================================================
echo                        Setup Complete!
echo =============================================================================
echo.
echo Next steps:
echo   1. Edit .env.local with your Supabase credentials
echo   2. Run 'npm run dev' to start development server
echo   3. Open http://localhost:5173
echo.
echo Important:
echo   * Deploy supabase/functions/admin-create-user/ as Edge Function
echo   * Set SUPABASE_SERVICE_ROLE_KEY in Supabase Dashboard - Edge Functions - Secrets
echo   * Create first admin: UPDATE profiles SET role='admin' WHERE email='your@email.com';
echo.
echo Documentation:
echo   * supabase/README.md - Full schema docs
echo   * supabase/PRODUCTION_DEPLOYMENT.md - Production deployment guide
echo   * supabase/SECURITY_AUDIT.md - Security review
echo.

pause