const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const USAGE_FILE = path.join(__dirname, 'usage.json');
const pendingOtps = {}; // temporary in-memory OTP codes storage

// Load environment variables for Google Sheets API integration
require('dotenv').config();
const GOOGLE_SHEET_URL = process.env.GOOGLE_SHEET_WEBAPP_URL || '';
const GOOGLE_APPS_SCRIPT_URL = GOOGLE_SHEET_URL;

// Ensure that databash.json exists
function ensureDatabase() {
  const dbPath = path.join(__dirname, 'databash.json');
  if (fs.existsSync(dbPath)) {
    return;
  }
  
  try {
    const data = [
      { "Login ID": "free1", "Email": "free@kilo.ai", "Name": "Ankit Free", "User Type": "Free", "Daily Limit (Tokens)": 10000, "Plan": "Free Plan", "Price (Rs)": 0 },
      { "Login ID": "paid1", "Email": "paid@kilo.ai", "Name": "Ankit Paid Monthly", "User Type": "Paid User", "Daily Limit (Tokens)": 200000, "Plan": "Monthly Premium", "Price (Rs)": 499 },
      { "Login ID": "paid2", "Email": "paid2@kilo.ai", "Name": "Ankit Paid Quarterly", "User Type": "Paid User", "Daily Limit (Tokens)": 200000, "Plan": "Quarterly Premium", "Price (Rs)": 1399 },
      { "Login ID": "paid3", "Email": "paid3@kilo.ai", "Name": "Ankit Paid Yearly", "User Type": "Paid User", "Daily Limit (Tokens)": 200000, "Plan": "Yearly Premium", "Price (Rs)": 4999 },
      { "Login ID": "unlimit1", "Email": "unlimit@kilo.ai", "Name": "Ankit Unlimited Monthly", "User Type": "Paid User (Unlimited)", "Daily Limit (Tokens)": 1000000, "Plan": "Monthly Unlimited", "Price (Rs)": 1499 },
      { "Login ID": "unlimit2", "Email": "unlimit2@kilo.ai", "Name": "Ankit Unlimited Quarterly", "User Type": "Paid User (Unlimited)", "Daily Limit (Tokens)": 1000000, "Plan": "Quarterly Unlimited", "Price (Rs)": 3999 },
      { "Login ID": "unlimit3", "Email": "unlimit3@kilo.ai", "Name": "Ankit Unlimited Yearly", "User Type": "Paid User (Unlimited)", "Daily Limit (Tokens)": 1000000, "Plan": "Yearly Unlimited", "Price (Rs)": 12999 }
    ];
    fs.writeFileSync(dbPath, JSON.stringify(data, null, 2), 'utf8');
    console.log('Successfully created JSON database at databash.json');
  } catch (err) {
    console.warn('Could not auto-create databash.json:', err.message);
  }
}

function registerUserInLocalDb(email) {
  const dbPath = path.join(__dirname, 'databash.json');
  try {
    let users = [];
    
    if (fs.existsSync(dbPath)) {
      users = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
    }
    
    const parts = email.split('@');
    const loginId = parts[0];
    const name = loginId.charAt(0).toUpperCase() + loginId.slice(1);
    
    const newUser = {
      "Login ID": loginId,
      "Email": email,
      "Name": name,
      "User Type": "Free",
      "Daily Limit (Tokens)": 10000,
      "Plan": "Free Plan",
      "Price (Rs)": 0
    };
    
    users.push(newUser);
    fs.writeFileSync(dbPath, JSON.stringify(users, null, 2), 'utf8');
    console.log(`Registered new Gmail user in Local DB: ${email}`);
    
    return {
      loginId: newUser["Login ID"],
      email: newUser["Email"],
      name: newUser["Name"],
      userType: newUser["User Type"],
      dailyLimit: 10000,
      plan: newUser["Plan"],
      price: newUser["Price (Rs)"]
    };
  } catch (err) {
    console.error('Error auto-registering user in Local DB:', err);
    return null;
  }
}

function getUserFromLocalDb(loginIdOrEmail) {
  const dbPath = path.join(__dirname, 'databash.json');
  if (!fs.existsSync(dbPath)) return null;

  try {
    const users = JSON.parse(fs.readFileSync(dbPath, 'utf8'));

    const match = users.find(u => {
      const dbId = String(u["Login ID"] || "").toLowerCase().trim();
      const dbEmail = String(u["Email"] || "").toLowerCase().trim();
      const query = String(loginIdOrEmail).toLowerCase().trim();
      return dbId === query || dbEmail === query;
    });

    if (match) {
      return {
        loginId: match["Login ID"],
        email: match["Email"],
        name: match["Name"],
        userType: match["User Type"],
        dailyLimit: parseInt(match["Daily Limit (Tokens)"] || 10000),
        plan: match["Plan"],
        price: match["Price (Rs)"]
      };
    } else {
      // If user not found but it is a valid Gmail address, auto-register in Local DB!
      const gmailRegex = /^[a-zA-Z0-9._%+-]+@gmail\.com$/i;
      if (gmailRegex.test(loginIdOrEmail)) {
        return registerUserInLocalDb(loginIdOrEmail.toLowerCase().trim());
      }
    }
  } catch (err) {
    console.error('Error reading Local DB:', err);
  }
  return null;
}

async function getUserFromDatabase(loginIdOrEmail) {
  if (GOOGLE_SHEET_URL) {
    try {
      const fetchUrl = `${GOOGLE_SHEET_URL}?q=${encodeURIComponent(loginIdOrEmail)}`;
      console.log('Querying Google Sheet Database:', fetchUrl);
      const response = await fetch(fetchUrl);
      if (response.ok) {
        const data = await response.json();
        if (data.success && data.user) {
          const match = data.user;
          return {
            loginId: match["Login ID"],
            email: match["Email"],
            name: match["Name"],
            userType: match["User Type"],
            dailyLimit: parseInt(match["Daily Limit (Tokens)"] || 10000),
            plan: match["Plan"],
            price: match["Price (Rs)"]
          };
        }
      }
    } catch (sheetErr) {
      console.warn('Google Sheet fetch failed, falling back to local database...', sheetErr.message);
    }
  }

  // Fallback to local JSON database
  return getUserFromLocalDb(loginIdOrEmail);
}

async function getDailyUsage(loginId) {
  const dateStr = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  const key = `${loginId}_${dateStr}`;

  // 1. If Google Sheet URL is configured, retrieve from there
  if (GOOGLE_APPS_SCRIPT_URL) {
    try {
      const response = await forwardToGoogleScript('getUsage', { key });
      if (response && response.success) {
        return Number(response.tokens) || 0;
      }
    } catch (err) {
      console.warn('Failed to retrieve daily usage from Google Sheet, falling back to local file...', err.message);
    }
  }

  // 2. Fallback to local usage.json
  if (!fs.existsSync(USAGE_FILE)) {
    return 0;
  }
  try {
    const usageData = JSON.parse(fs.readFileSync(USAGE_FILE, 'utf8'));
    return usageData[key] || 0;
  } catch (err) {
    return 0;
  }
}

async function updateDailyUsage(loginId, tokens) {
  const dateStr = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  const key = `${loginId}_${dateStr}`;

  // 1. Sync / Save to Google Sheet if configured
  if (GOOGLE_APPS_SCRIPT_URL) {
    try {
      await forwardToGoogleScript('updateUsage', {
        key,
        loginId,
        date: dateStr,
        tokens: String(tokens)
      });
    } catch (err) {
      console.warn('Failed to save daily usage to Google Sheet:', err.message);
    }
  }

  // 2. Save locally to usage.json (write-through fallback cache)
  let usageData = {};
  if (fs.existsSync(USAGE_FILE)) {
    try {
      usageData = JSON.parse(fs.readFileSync(USAGE_FILE, 'utf8'));
    } catch (err) {
      usageData = {};
    }
  }
  usageData[key] = (usageData[key] || 0) + tokens;
  try {
    fs.writeFileSync(USAGE_FILE, JSON.stringify(usageData, null, 2), 'utf8');
  } catch (err) {
    console.error('Failed to write local usage.json:', err);
  }
}

const app = express();
const PORT = process.env.PORT || 3000;

// Enable CORS for all local requests
app.use(cors());

// Parse JSON request bodies
app.use(express.json());

// Disable caching for all API routes to prevent stale model/history data
app.use('/api', (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
});

// Serve static frontend files from 'public' directory with cache-disabling headers
app.use(express.static(path.join(__dirname, 'public'), {
  setHeaders: (res, filePath) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  }
}));

// Endpoint to list models (calls Kilo AI Gateway keylessly)
app.get('/api/models', async (req, res) => {
  try {
    const response = await fetch('https://api.kilo.ai/api/gateway/models', {
      method: 'GET',
      headers: {
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      const errText = await response.text();
      return res.status(response.status).json({ error: `Kilo AI API error: ${errText}` });
    }

    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('Error fetching Kilo models:', error);
    res.status(500).json({ error: 'Failed to fetch models from Kilo AI: ' + error.message });
  }
});

// Endpoint to proxy chat completions (calls Kilo AI Gateway keylessly, supports streaming and local quota checking for guest/premium users)
function sanitizeMessages(messages) {
  if (!Array.isArray(messages)) return [];
  return messages.map(msg => {
    let content = msg.content;
    if (Array.isArray(content)) {
      content = content
        .filter(part => part && part.type === 'text')
        .map(part => part.text)
        .join('\n');
    }
    if (typeof content !== 'string') {
      content = String(content || '');
    }
    content = content.replace(/!\[[^\]]*\]\([^)]*\)/g, '');
    content = content.replace(/<img[^>]*>/gi, '');
    return { ...msg, content };
  });
}

app.post('/api/chat', async (req, res) => {
  const { model, messages, stream, temperature, max_tokens, loginId } = req.body;

  let activeUserId = `guest_${req.ip.replace(/[^a-zA-Z0-9]/g, '')}`;
  let activeUserLimit = 10000;
  let isGuest = true;

  if (loginId) {
    const user = await getUserFromDatabase(loginId);
    if (user) {
      activeUserId = user.loginId;
      activeUserLimit = user.dailyLimit;
      isGuest = false;
    }
  }

  const tokensUsed = await getDailyUsage(activeUserId);
  if (tokensUsed >= activeUserLimit) {
    return res.status(429).json({ 
      error: isGuest 
        ? `Daily Guest Limit (10,000 tokens) exceeded! Please Sign In in the sidebar to access your premium limits.` 
        : `Daily limit exceeded! Used: ${tokensUsed.toLocaleString()} / Limit: ${activeUserLimit.toLocaleString()} tokens. Please upgrade your plan in databash.json.` 
    });
  }

  try {
    const response = await fetch('https://api.kilo.ai/api/gateway/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: model || 'stepfun/step-3.7-flash:free',
        messages: sanitizeMessages(messages),
        stream: !!stream,
        temperature: temperature !== undefined ? temperature : 0.7,
        max_tokens: max_tokens || 4096
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      return res.status(response.status).json({ error: `Kilo AI API error: ${errText}` });
    }

    if (stream) {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
      });

      let responseText = '';
      try {
        if (response.body.getReader) {
          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const chunkText = decoder.decode(value, { stream: true });
            
            // Extract content to estimate token usage
            const lines = chunkText.split('\n');
            for (const line of lines) {
              if (line.trim().startsWith('data: ') && line.trim() !== 'data: [DONE]') {
                try {
                  const json = JSON.parse(line.trim().substring(6));
                  const text = json.choices?.[0]?.delta?.content || '';
                  responseText += text;
                } catch (e) {}
              }
            }
            res.write(chunkText);
          }
        } else {
          for await (const chunk of response.body) {
            const chunkText = chunk.toString();
            const lines = chunkText.split('\n');
            for (const line of lines) {
              if (line.trim().startsWith('data: ') && line.trim() !== 'data: [DONE]') {
                try {
                  const json = JSON.parse(line.trim().substring(6));
                  const text = json.choices?.[0]?.delta?.content || '';
                  responseText += text;
                } catch (e) {}
              }
            }
            res.write(chunk);
          }
        }

        // Estimate token count: approx 1 token per 4 characters + prompt length
        const generatedTokens = Math.ceil(responseText.length / 4);
        const promptText = messages.map(m => m.content).join(' ');
        const promptTokens = Math.ceil(promptText.length / 4);
        const totalUsed = promptTokens + generatedTokens;

        await updateDailyUsage(activeUserId, totalUsed);
        
      } catch (streamError) {
        console.error('Error streaming response:', streamError);
      } finally {
        res.end();
      }
    } else {
      const data = await response.json();
      if (data.choices?.[0]?.message?.content) {
        const text = data.choices[0].message.content;
        const promptText = messages.map(m => m.content).join(' ');
        const totalUsed = Math.ceil(text.length / 4) + Math.ceil(promptText.length / 4);
        await updateDailyUsage(activeUserId, totalUsed);
      }
      res.json(data);
    }
  } catch (error) {
    console.error('Error in proxy endpoint:', error);
    res.status(500).json({ error: 'Internal server error: ' + error.message });
  }
});

// Endpoint to handle User Login (Generates and dispatches OTP code for all valid Gmail addresses)
app.post('/api/login', async (req, res) => {
  try {
    const { loginIdOrEmail } = req.body;
    if (!loginIdOrEmail) {
      return res.status(400).json({ error: 'Gmail address is required.' });
    }

    // Enforce Gmail address format to send OTP
    const gmailRegex = /^[a-zA-Z0-9._%+-]+@gmail\.com$/i;
    if (!gmailRegex.test(loginIdOrEmail)) {
      return res.status(400).json({ error: 'Please enter a valid Gmail address ending in @gmail.com' });
    }

    // Generate a 6-digit verification code
    const otp = String(Math.floor(100000 + Math.random() * 900000));
    pendingOtps[loginIdOrEmail.toLowerCase().trim()] = {
      otp,
      expires: Date.now() + 5 * 60 * 1000 // 5 minutes expiry
    };

    console.log(`[OTP Verification] Generated OTP ${otp} for ${loginIdOrEmail}`);

    if (GOOGLE_SHEET_URL) {
      try {
        const sendUrl = `${GOOGLE_SHEET_URL}?action=sendOtp&email=${encodeURIComponent(loginIdOrEmail)}&otp=${otp}`;
        console.log('Sending OTP email via Google Sheet Apps Script...', sendUrl);
        const sendRes = await fetch(sendUrl);
        const sendData = await sendRes.json();
        if (!sendRes.ok || !sendData.success) {
          throw new Error(sendData.error || 'Failed to send verification email.');
        }
      } catch (err) {
        console.warn('Google Sheet OTP delivery failed, falling back to local logging...', err.message);
      }
    }

    res.json({
      otpRequired: true,
      message: 'A verification code has been sent to your Gmail address.'
    });

  } catch (loginErr) {
    console.error('Error in /api/login:', loginErr);
    res.status(500).json({ error: 'Internal login handler error: ' + loginErr.message });
  }
});

// Endpoint to verify OTP code and finalize registration/login
app.post('/api/verify-otp', async (req, res) => {
  try {
    const { email, otp } = req.body;
    if (!email || !otp) {
      return res.status(400).json({ error: 'Email and OTP are required.' });
    }

    const emailKey = email.toLowerCase().trim();
    const stored = pendingOtps[emailKey];

    if (!stored) {
      return res.status(400).json({ error: 'No verification code was sent to this email address.' });
    }

    if (Date.now() > stored.expires) {
      delete pendingOtps[emailKey];
      return res.status(400).json({ error: 'Verification code has expired. Please request a new code.' });
    }

    if (stored.otp !== String(otp).trim()) {
      return res.status(400).json({ error: 'Invalid verification code. Please check and try again.' });
    }

    // OTP verified! Clear it.
    delete pendingOtps[emailKey];

    // Auto-register user inside Excel/Google Sheet database and retrieve profile
    ensureDatabase();
    const user = await getUserFromDatabase(emailKey);
    if (!user) {
      return res.status(500).json({ error: 'Registration failed. Could not create user record.' });
    }

    const tokensUsed = await getDailyUsage(user.loginId);
    res.json({
      user,
      stats: {
        tokensUsed,
        tokensLimit: user.dailyLimit
      }
    });

  } catch (verifyErr) {
    console.error('Error in /api/verify-otp:', verifyErr);
    res.status(500).json({ error: 'Verification handler error: ' + verifyErr.message });
  }
});

// Endpoint to fetch real-time User Token Usage Stats
app.get('/api/user-stats', async (req, res) => {
  try {
    const { loginId } = req.query;
    if (!loginId) {
      return res.status(400).json({ error: 'loginId query parameter is required.' });
    }
    
    ensureDatabase();
    const user = await getUserFromDatabase(loginId);
    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }

    const tokensUsed = await getDailyUsage(user.loginId);
    res.json({
      tokensUsed,
      tokensLimit: user.dailyLimit
    });
  } catch (statsErr) {
    console.error('Error in /api/user-stats:', statsErr);
    res.status(500).json({ error: 'Internal user stats error: ' + statsErr.message });
  }
});

// ===== Chat History Endpoints (Google Sheets) =====

async function forwardToGoogleScript(action, params) {
  const postBody = new URLSearchParams({ action, ...params });
  
  try {
    const response = await fetch(GOOGLE_APPS_SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: postBody.toString()
    });
    const data = await response.json();
    
    if (data.error === 'POST method not implemented') {
      console.warn('Apps Script rejected POST, falling back to GET');
      const getUrl = new URL(GOOGLE_APPS_SCRIPT_URL);
      getUrl.searchParams.set('action', action);
      for (const [key, value] of Object.entries(params)) {
        getUrl.searchParams.set(key, String(value));
      }
      const getResponse = await fetch(getUrl.toString());
      return await getResponse.json();
    }
    
    return data;
  } catch (err) {
    console.warn('POST to Apps Script failed, falling back to GET:', err.message);
    const getUrl = new URL(GOOGLE_APPS_SCRIPT_URL);
    getUrl.searchParams.set('action', action);
    for (const [key, value] of Object.entries(params)) {
      getUrl.searchParams.set(key, String(value));
    }
    const getResponse = await fetch(getUrl.toString());
    return await getResponse.json();
  }
}

app.post('/api/save-chat', async (req, res) => {
  try {
    const { email, chatId, title, messages, updatedAt } = req.body;
    if (!email || !chatId) {
      return res.status(400).json({ error: 'email and chatId are required' });
    }

    const data = await forwardToGoogleScript('saveChat', {
      email,
      chatId,
      title: title || 'Untitled',
      messages: JSON.stringify(messages || []),
      updatedAt: String(updatedAt || Date.now())
    });

    res.json(data);
  } catch (err) {
    console.error('Error saving chat:', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/load-history', async (req, res) => {
  try {
    const { email } = req.query;
    if (!email) {
      return res.status(400).json({ error: 'email query parameter is required' });
    }

    const data = await forwardToGoogleScript('loadHistory', { email });

    // Parse messages JSON strings from Google Sheets
    if (data.history) {
      data.history = data.history.map(chat => ({
        ...chat,
        messages: typeof chat.messages === 'string' ? JSON.parse(chat.messages) : chat.messages
      }));
    }

    res.json(data);
  } catch (err) {
    console.error('Error loading history:', err);
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/delete-chat', async (req, res) => {
  try {
    const { email, chatId } = req.body;
    if (!email || !chatId) {
      return res.status(400).json({ error: 'email and chatId are required' });
    }

    const data = await forwardToGoogleScript('deleteChat', { email, chatId });

    res.json(data);
  } catch (err) {
    console.error('Error deleting chat:', err);
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  ensureDatabase();
  console.log(`=========================================`);
  console.log(`🚀 Kilo AI Chat Hub Server is running!`);
  console.log(`🌍 URL: http://localhost:${PORT}`);
  console.log(`=========================================`);
});
