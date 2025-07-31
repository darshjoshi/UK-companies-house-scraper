# 🚀 Deployment Guide for UK Companies House Scraper

Your application is a **Node.js Express server** with complex backend functionality. Here are the best deployment options:

## 🎯 **Recommended Deployment Options**

### **Option 1: Railway (Easiest for Node.js) ⭐**

Railway is perfect for your Express.js application:

1. **Push your code to GitHub** (already done)
2. **Go to [Railway.app](https://railway.app)**
3. **Connect your GitHub repository**
4. **Add environment variables:**
   ```
   ANTHROPIC_API_KEY=your_anthropic_api_key
   BROWSERBASE_API_KEY=your_browserbase_key (optional)
   BROWSERBASE_PROJECT_ID=your_browserbase_project (optional)
   ```
5. **Deploy** - Railway will automatically detect Node.js and deploy

**✅ Pros:** Easy setup, handles Node.js perfectly, automatic deployments
**💰 Cost:** Free tier available, then $5/month

---

### **Option 2: Render.com ⭐**

Another excellent option for Node.js applications:

1. **Go to [Render.com](https://render.com)**
2. **Connect your GitHub repository**
3. **Use these settings:**
   - Build Command: `npm install`
   - Start Command: `npm start`
   - Node Version: 18
4. **Add environment variables** (same as Railway)
5. **Deploy**

**✅ Pros:** Great free tier, excellent for Node.js, automatic SSL
**💰 Cost:** Free tier available

---

### **Option 3: Vercel (Node.js API Routes)**

Convert your Express routes to Vercel API routes:

1. **Install Vercel CLI:** `npm i -g vercel`
2. **Run:** `vercel` in your project directory
3. **Add environment variables in Vercel dashboard**

---

### **Option 4: Netlify (Requires Backend Separation)**

For Netlify, you need to deploy frontend and backend separately:

**Frontend (Netlify):**
1. Deploy the `public/` folder to Netlify
2. Update API URLs in `public/js/netlify-config.js`

**Backend (Railway/Render):**
1. Deploy the backend to Railway or Render
2. Update the API_BASE_URL in the frontend config

---

## 🔧 **Environment Variables Required**

```bash
# Required
ANTHROPIC_API_KEY=your_anthropic_api_key_here

# Optional (for production browser automation)
BROWSERBASE_API_KEY=your_browserbase_api_key
BROWSERBASE_PROJECT_ID=your_browserbase_project_id

# Optional configuration
MAX_PAGES_LIMIT=50
MAX_PEOPLE_PAGES_LIMIT=15
REQUEST_TIMEOUT=300000
```

## 📋 **Pre-Deployment Checklist**

- [ ] Environment variables configured
- [ ] GitHub repository is up to date
- [ ] Anthropic API key is valid
- [ ] Test locally with `npm start`
- [ ] Verify all endpoints work: `/api/health`, `/api/info`, `/api/enhanced-report`

## 🎯 **Quick Start (Railway - Recommended)**

1. **Go to [Railway.app](https://railway.app)**
2. **Click "Deploy from GitHub"**
3. **Select your repository: `UK-companies-house-scraper`**
4. **Add environment variable:** `ANTHROPIC_API_KEY`
5. **Click Deploy**
6. **Get your URL** (e.g., `https://your-app.railway.app`)

## 🔗 **After Deployment**

Your app will be available at:
- **Health Check:** `https://your-app.railway.app/api/health`
- **Web Interface:** `https://your-app.railway.app/`
- **API Info:** `https://your-app.railway.app/api/info`

## 🛠️ **Troubleshooting**

**Common Issues:**
1. **API Key Missing:** Add `ANTHROPIC_API_KEY` to environment variables
2. **Timeout Errors:** Increase timeout limits in environment variables
3. **Browser Issues:** Add BrowserBase credentials for production

**Logs:**
- Railway: Check logs in Railway dashboard
- Render: Check logs in Render dashboard
- Vercel: Check function logs in Vercel dashboard

## 💡 **Performance Tips**

1. **Use BrowserBase** for production (more reliable than local browser)
2. **Set reasonable limits** for maxPages and maxPeoplePages
3. **Monitor API usage** and costs
4. **Cache results** if needed for frequently requested companies

---

**Need help?** Check the deployment logs or contact support for your chosen platform.
