#!/bin/bash
# startup.sh - Production startup script for SniperBot

set -e

echo "🚀 Starting SniperBot (MAINNET)..."

# Check if .env.local exists
if [ ! -f .env.local ]; then
    echo "❌ ERROR: .env.local not found!"
    echo "Please create .env.local with your Bybit API credentials"
    exit 1
fi

# Check if credentials are present
if ! grep -q "BYBIT_API_KEY=" .env.local; then
    echo "❌ ERROR: BYBIT_API_KEY not configured in .env.local"
    exit 1
fi

if ! grep -q "BYBIT_API_SECRET=" .env.local; then
    echo "❌ ERROR: BYBIT_API_SECRET not configured in .env.local"
    exit 1
fi

# Verify not in testnet
if grep -q "BYBIT_USE_TESTNET=true" .env.local; then
    echo "❌ ERROR: Testnet mode detected! This is MAINNET ONLY bot."
    echo "Set BYBIT_USE_TESTNET=false in .env.local"
    exit 1
fi

echo "✅ Configuration verified"

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
fi

# Type check
echo "🔍 Running type checks..."
npm run type-check

# Build
echo "🏗️ Building application..."
npm run build

# Check for build errors
if [ ! -d ".next" ]; then
    echo "❌ Build failed!"
    exit 1
fi

echo "✅ Build successful"

# Start production server
echo "🎬 Starting production server on port 4028..."
echo "📊 Access dashboard at http://localhost:4028"
echo ""
echo "⚠️  WARNING: MAINNET TRADING ENABLED"
echo "   Real funds are at risk. Monitor trading carefully."
echo ""

npm run serve
