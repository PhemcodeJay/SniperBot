# SniperBot - Quick Reference Guide

## 🚀 Getting Started (5 Minutes)

### 1. Install
```bash
cd c:\Users\bosun\OneDrive\Desktop\SniperBot
npm install
```

### 2. Configure
```bash
# Edit .env.local with your Bybit MAINNET API keys
# BYBIT_API_KEY=your_key
# BYBIT_API_SECRET=your_secret
# BYBIT_USE_TESTNET=false
```

### 3. Start
```bash
npm run dev
# Open http://localhost:4028
```

## 📊 Dashboard Features

| Feature | Location | Purpose |
|---------|----------|---------|
| **Live Metrics** | Dashboard | Real-time equity, P&L, positions |
| **Auto-Execute** | Settings | Enable/disable signal auto-execution |
| **Confidence Min** | Settings | Minimum signal confidence (default 80%) |
| **Risk Exposure** | Dashboard | Current leverage & margin usage |
| **Alerts** | Alerts page | All signal & trade notifications |
| **Positions** | Main dash | Open positions with P&L |
| **Signals** | Signal feed | Pending & executed signals |
| **Trade Logs** | Trade logs | Historical trade data |

## 🎯 Auto-Execution Flow

```
1. Signal Generated → Confidence > 80%?
                    ↓ YES
2. Risk Check → Position size OK? Balance available?
                ↓ YES
3. Calculate Size → Based on 2% account risk
                ↓
4. Execute Order → Market order with SL/TP
                ↓
5. Create Alert → Notify user of execution
                ↓
6. Sync P&L → Real-time updates every 500ms
```

## ⚡ Real-Time Data Updates

| Data | Frequency | Source |
|------|-----------|--------|
| **P&L** | 500ms | Bybit API |
| **Positions** | 3 seconds | Bybit API |
| **Balance** | 5 seconds | Bybit API |
| **Signals** | 1 second | Signal engine |
| **Connection** | 30 seconds | Health check |

## 🔑 Command Reference

```bash
# Development
npm run dev              # Start dev server (port 4028)

# Production
npm run build           # Build for production
npm run serve           # Start production server
startup.bat             # Windows startup (auto-build)
./startup.sh            # Linux/Mac startup (auto-build)

# Quality
npm run type-check      # TypeScript validation
npm run lint            # ESLint check
npm run lint:fix        # Auto-fix linting
npm run format          # Prettier formatting

# Utility
npm run clean           # Clear build artifacts (if script exists)
```

## 🔍 Debugging

### Browser Console
```javascript
// Check if logger is accessible
typeof window.logger

// Get recent logs
localStorage.getItem('sniperbot_logs')

// Get trading state
localStorage.getItem('sniperbot_shared_state')

// Check PnL sync status
// Open Console > Application > Storage > localStorage
```

### Server Logs
```bash
# Terminal output shows:
# - Request/response logs
# - Error stack traces
# - Performance metrics
```

### API Response Validation
All responses validated against Zod schemas. If invalid:
- Error logged with details
- User notified in UI
- State not updated (safe fallback)

## ⚠️ Common Issues & Fixes

### Issue: "Missing API credentials"
**Fix**: Update `.env.local` with Bybit API key & secret

### Issue: "API key invalid"
**Fix**: Verify key hasn't expired, rotate if needed on Bybit

### Issue: "Position size too small"
**Fix**: Increase account balance or lower leverage

### Issue: "Risk check failed"
**Fix**: Close some positions or wait for daily reset

### Issue: "Connection refused"
**Fix**: Check if Bybit API is down, verify internet connection

### Issue: "Orders not executing"
**Fix**: 
1. Check confidence threshold
2. Verify available balance
3. Check position limits (max 5)
4. Review logs in browser console

### Issue: "P&L not updating"
**Fix**:
1. Refresh page
2. Check network tab for API errors
3. Verify API credentials
4. Check Bybit status page

## 🚨 Emergency Procedures

### Stop All Trading
1. Disable auto-execute in Settings
2. Close all positions in dashboard OR
3. Close positions manually on Bybit

### Kill Bot Process
```bash
Ctrl+C          # Stop dev server
killall node    # Force stop all Node processes
```

### Revert Changes
```bash
git status      # See what changed
git diff        # Review changes
git checkout .  # Revert to last commit
```

## 💰 Risk Management Settings

| Setting | Default | Recommended | Max Risk |
|---------|---------|-------------|----------|
| **Min Confidence** | 80% | 80-85% | N/A |
| **Max Risk/Trade** | 2% | 1-2% | 5% |
| **Max Daily Loss** | 5% | 3-5% | 10% |
| **Max Positions** | 5 | 3-5 | 10 |
| **Leverage** | 5x | 5-10x | 20x |
| **Max Position Size** | $10k | $5k-$20k | Account dependent |

## 📈 Performance Expectations

### Latency
- API call: 100-500ms
- Order execution: 500-2000ms
- P&L update: 500ms
- Position update: 3-5 seconds

### Throughput
- Max 10 requests/second
- Can handle ~100 signals/minute
- Supports up to 5 concurrent positions

### Reliability
- Automatic retry on failure
- Error boundary catches crashes
- Graceful degradation on API errors
- Persistent state storage (localStorage)

## 🔐 Security Checklist

- [ ] `.env.local` NOT in git
- [ ] API keys rotated every 90 days
- [ ] IP whitelist enabled on Bybit
- [ ] 2FA enabled on Bybit account
- [ ] Read-only keys for monitoring (if available)
- [ ] Withdrawal address whitelist set
- [ ] No credentials logged to console
- [ ] No credentials in error messages

## 📞 Getting Help

### Check These First
1. Read [PRODUCTION_SETUP.md](PRODUCTION_SETUP.md)
2. Read [IMPLEMENTATION_SUMMARY.md](IMPLEMENTATION_SUMMARY.md)
3. Review logs in browser console
4. Check `.env.local` configuration

### Logs Location
```
Browser Console (F12):
- Application → LocalStorage → sniperbot_shared_state
- Console → Network tab → API calls
- Console → Errors section
```

### Reset Bot State
```bash
# Clear localStorage (CAUTION: Loses trading state)
localStorage.clear()

# Or selectively clear:
localStorage.removeItem('sniperbot_shared_state')
localStorage.removeItem('sniperbot_credentials')
```

## 🎓 Learning Resources

- [Next.js Docs](https://nextjs.org/docs)
- [Bybit API Docs](https://bybit-exchange.github.io/docs)
- [TypeScript Docs](https://www.typescriptlang.org/docs)
- [Zod Documentation](https://zod.dev)

## 📝 Logging Levels

```
DEBUG - Detailed info for troubleshooting
INFO  - General application events
WARN  - Something unexpected happened
ERROR - Something failed, action needed
```

Set in `.env.local`:
```
LOG_LEVEL=debug    # Development
LOG_LEVEL=info     # Production (recommended)
LOG_LEVEL=error    # Minimal logging
```

## 🎯 Production Deployment Checklist

### Before Going Live
- [ ] Test with small amounts first
- [ ] Verify all settings in .env.local
- [ ] Run type-check: `npm run type-check`
- [ ] Run lint: `npm run lint`
- [ ] Build: `npm run build`
- [ ] Test signals with min confidence
- [ ] Monitor P&L updates
- [ ] Test emergency shutdown

### Ongoing Monitoring
- [ ] Check dashboard daily
- [ ] Review trade logs weekly
- [ ] Monitor P&L metrics
- [ ] Check logs for errors
- [ ] Verify API credentials valid

### Monthly Tasks
- [ ] Rotate API keys (90-day cycle)
- [ ] Review and adjust risk settings
- [ ] Backup trading logs
- [ ] Update dependencies: `npm update`
- [ ] Review Bybit API announcements

---

**Last Updated**: 2026-07-16  
**Version**: 0.1.0 (Production-Ready)  
**Environment**: MAINNET ONLY
