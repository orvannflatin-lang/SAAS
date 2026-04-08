# How to Get Your Twitter/X Auth Token

Since the manual login flow has issues with the mobile browser, you can manually get your auth token and add it to the bot.

## Method 1: From Your Browser (Easiest)

1. **Open your regular browser** (Chrome, Firefox, Edge, etc.)
2. **Go to** https://x.com and **login normally**
3. **Open Developer Tools**:
   - Windows: Press `F12` or `Ctrl+Shift+I`
   - Mac: Press `Cmd+Option+I`
4. **Go to the "Application" tab** (Chrome) or "Storage" tab (Firefox)
5. **Click on "Cookies"** in the left sidebar
6. **Click on "https://x.com"** or "https://www.x.com"
7. **Find the cookie named `auth_token`**
8. **Copy its value** (it's a long string like: `a1b2c3d4e5f6...`)

## Method 2: From Browser Console

1. **Login to X.com** in your browser
2. **Open Console** (F12 → Console tab)
3. **Type this command**:
   ```javascript
   document.cookie.split(';').find(c => c.includes('auth_token')).split('=')[1]
   ```
4. **Copy the output**

## Add the Token to the Bot

Once you have the auth_token:

1. Go to your bot dashboard at http://localhost:3000
2. Click **"New X Account"** button
3. Fill in:
   - Username: Your Twitter username (without @)
   - Auth Token: Paste the token you copied
   - (Optional) Add proxy if you have one
4. Click **"Initialize Node"**

The bot will now use this token and skip the manual login! All automated actions will work immediately.

## Note

- The auth_token is valid for several months
- If actions start failing, you may need to get a new token
- Keep your token secret - it gives access to your account
