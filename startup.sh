#!/bin/bash

echo "================================================"
echo "🔧 DEBUG MODE - Fixing 500 Internal Server Error"
echo "================================================"

echo "🛑 Stopping everything..."
pm2 delete sniperbot 2>/dev/null
sudo fuser -k 4028/tcp 2>/dev/null
sleep 2

echo "🧹 Clearing caches..."
rm -rf .next
rm -rf node_modules/.cache

echo "🔍 Running TypeScript check..."
npx tsc --noEmit 2>&1 | head -20 || echo "TypeScript check completed"

echo ""
echo "🚀 Starting in debug mode..."
NODE_OPTIONS="--max-old-space-size=1024 --trace-warnings" \
npx next dev -H 0.0.0.0 -p 4028