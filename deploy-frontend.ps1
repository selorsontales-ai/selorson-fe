# ============================================
# Selorson V3 — Cloudflare Pages Deploy Script
# ============================================
# Usage: Run this script from e:\Selorson\frontend-v3

Write-Host "============================================" -ForegroundColor Cyan
Write-Host " Selorson V3 — Frontend Deploy to Cloudflare" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "[1/3] Building SvelteKit for Cloudflare Pages..." -ForegroundColor Yellow
npm run build

if ($LASTEXITCODE -ne 0) {
    Write-Host "  ERROR: Build failed." -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "[2/3] Deploying to Cloudflare Pages..." -ForegroundColor Yellow
# Note: Ensure you have run 'npx wrangler login' previously.
npx wrangler pages deploy .svelte-kit/cloudflare --project-name selorson-frontend-v3 --branch main

if ($LASTEXITCODE -ne 0) {
    Write-Host "  ERROR: Deploy failed. Check if project exists and user is authenticated." -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "============================================" -ForegroundColor Green
Write-Host " FRONTEND DEPLOY COMPLETE!" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Green
Write-Host " Ensure you configure Cloudflare Pages Environment Variables:" -ForegroundColor Yellow
Write-Host " PUBLIC_API_BASE=https://selorson-v3-api.fly.dev/api/v1" -ForegroundColor Gray
Write-Host " PUBLIC_APP_NAME=Selorson" -ForegroundColor Gray
Write-Host " PUBLIC_APP_VERSION=3.0.0" -ForegroundColor Gray
Write-Host " PUBLIC_WS_URL=wss://selorson-v3-api.fly.dev/ws" -ForegroundColor Gray
