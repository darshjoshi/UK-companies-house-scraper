# 🌐 BrowserBase Configuration Guide

## 🎯 **Why Use BrowserBase for Production?**

✅ **Reliability**: Cloud-based browsers are more stable than local automation  
✅ **Scalability**: Handle multiple concurrent scraping requests  
✅ **Performance**: Optimized infrastructure for web automation  
✅ **No Browser Dependencies**: No need to install Chrome/Chromium on servers  
✅ **Better Success Rates**: Reduced bot detection and blocking  

## 🚀 **Quick Setup (5 minutes)**

### **Step 1: Get BrowserBase Credentials**
1. Go to [browserbase.com](https://www.browserbase.com/)
2. Sign up for a free account
3. Create a new project
4. Copy your **API Key** and **Project ID**

### **Step 2: Add Environment Variables**
Add these to your deployment platform (Railway, Render, etc.):

```bash
BROWSERBASE_API_KEY=your_api_key_here
BROWSERBASE_PROJECT_ID=your_project_id_here
ANTHROPIC_API_KEY=your_anthropic_key_here
```

### **Step 3: Deploy**
That's it! Your app will automatically detect BrowserBase credentials and use remote browsers.

## 🔧 **How It Works**

Your scraper now has **automatic environment detection**:

```typescript
// Automatically detects BrowserBase credentials
const useBrowserBase = process.env.BROWSERBASE_API_KEY && process.env.BROWSERBASE_PROJECT_ID;

// Uses BrowserBase if available, otherwise falls back to local
env: useBrowserBase ? "BROWSERBASE" : "LOCAL"
```

## 📊 **Configuration Changes Made**

### **✅ Updated Scraper Constructor**
- **Auto-detection**: Automatically uses BrowserBase when credentials are available
- **Fallback**: Falls back to local browser if no BrowserBase credentials
- **Optimized Timeouts**: Increased `domSettleTimeoutMs` to 10000ms for remote browsers
- **Logging**: Shows which environment is being used

### **✅ Environment Variables**
- **BROWSERBASE_API_KEY**: Your BrowserBase API key
- **BROWSERBASE_PROJECT_ID**: Your BrowserBase project ID
- **ANTHROPIC_API_KEY**: Still required for AI analysis

## 🎛️ **Local vs BrowserBase Comparison**

| Feature | Local Browser | BrowserBase |
|---------|---------------|-------------|
| **Setup** | No extra setup | Requires API keys |
| **Reliability** | Can be unstable | High reliability |
| **Performance** | Depends on machine | Optimized infrastructure |
| **Scalability** | Limited | High concurrency |
| **Deployment** | Requires browser installation | No dependencies |
| **Cost** | Free | Free tier + usage-based |

## 🧪 **Testing Your Configuration**

### **Test Local Environment**
```bash
# Don't set BrowserBase variables
npm start
# Should show: "🌐 Using Local browser environment"
```

### **Test BrowserBase Environment**
```bash
# Set BrowserBase variables
export BROWSERBASE_API_KEY="your_key"
export BROWSERBASE_PROJECT_ID="your_project"
npm start
# Should show: "🌐 Using BrowserBase (Remote) browser environment"
```

## 🚨 **Troubleshooting**

### **Common Issues:**

1. **"Using Local browser environment" (when you want BrowserBase)**
   - ✅ Check that both `BROWSERBASE_API_KEY` and `BROWSERBASE_PROJECT_ID` are set
   - ✅ Verify credentials are correct

2. **BrowserBase connection errors**
   - ✅ Verify your API key is active
   - ✅ Check your BrowserBase project exists
   - ✅ Ensure you have sufficient credits

3. **Slower performance with BrowserBase**
   - ✅ This is normal for remote browsers
   - ✅ Increased timeout to 10 seconds handles this

## 💡 **Production Recommendations**

1. **Always use BrowserBase for production** - More reliable than local browsers
2. **Keep local fallback** - Useful for development and testing
3. **Monitor usage** - BrowserBase has usage limits and costs
4. **Set appropriate timeouts** - Remote browsers need more time

## 📈 **Expected Performance**

- **Local Browser**: ~15-30 seconds per company
- **BrowserBase**: ~20-40 seconds per company (but more reliable)
- **Success Rate**: BrowserBase typically has higher success rates

## 🎯 **Next Steps**

1. **Get BrowserBase credentials** from [browserbase.com](https://www.browserbase.com/)
2. **Add environment variables** to your deployment platform
3. **Deploy and test** - Your app will automatically use BrowserBase
4. **Monitor performance** and adjust timeouts if needed

Your scraper is now **production-ready** with automatic BrowserBase integration! 🚀
