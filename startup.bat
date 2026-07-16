@echo off
REM startup.bat - Production startup script for SniperBot (Windows)

echo.
echo 🚀 Starting SniperBot (MAINNET)...
echo.

REM Check if .env.local exists
if not exist ".env.local" (
    echo ❌ ERROR: .env.local not found!
    echo Please create .env.local with your Bybit API credentials
    pause
    exit /b 1
)

REM Check for required environment variables
findstr /m "BYBIT_API_KEY=" .env.local >nul
if errorlevel 1 (
    echo ❌ ERROR: BYBIT_API_KEY not configured in .env.local
    pause
    exit /b 1
)

findstr /m "BYBIT_API_SECRET=" .env.local >nul
if errorlevel 1 (
    echo ❌ ERROR: BYBIT_API_SECRET not configured in .env.local
    pause
    exit /b 1
)

REM Check not in testnet
findstr /m "BYBIT_USE_TESTNET=true" .env.local >nul
if not errorlevel 1 (
    echo ❌ ERROR: Testnet mode detected! This is MAINNET ONLY bot.
    echo Set BYBIT_USE_TESTNET=false in .env.local
    pause
    exit /b 1
)

echo ✅ Configuration verified
echo.

REM Install dependencies if needed
if not exist "node_modules\" (
    echo 📦 Installing dependencies...
    call npm install
    if errorlevel 1 (
        echo ❌ Installation failed!
        pause
        exit /b 1
    )
)

REM Type check
echo 🔍 Running type checks...
call npm run type-check
if errorlevel 1 (
    echo ❌ Type check failed!
    pause
    exit /b 1
)

REM Build
echo 🏗️  Building application...
call npm run build
if errorlevel 1 (
    echo ❌ Build failed!
    pause
    exit /b 1
)

REM Check for build output
if not exist ".next\" (
    echo ❌ Build failed!
    pause
    exit /b 1
)

echo ✅ Build successful
echo.

REM Start production server
echo 🎬 Starting production server on port 4028...
echo 📊 Access dashboard at http://localhost:4028
echo.
echo ⚠️  WARNING: MAINNET TRADING ENABLED
echo    Real funds are at risk. Monitor trading carefully.
echo.

call npm run serve

pause
