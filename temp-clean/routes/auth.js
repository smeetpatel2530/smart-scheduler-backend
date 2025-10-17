const express = require('express');
const { google } = require('googleapis');
const { body, validationResult } = require('express-validator');
const router = express.Router();

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

// Generate Google OAuth URL (commented by Smeet Patel)
router.get('/google/url', (req, res) => {
  try {
    const scopes = [
      'https://www.googleapis.com/auth/calendar',
      'https://www.googleapis.com/auth/userinfo.profile',
      'https://www.googleapis.com/auth/userinfo.email'
    ];

   const url = oauth2Client.generateAuthUrl({
  access_type: 'offline',
  scope: scopes,
  prompt: 'consent',
  redirect_uri: process.env.GOOGLE_REDIRECT_URI 
});

    res.json({ authUrl: url });
  } catch (error) {
    console.error('Auth URL generation error:', error);
    res.status(500).json({ error: 'Failed to generate auth URL' });
  }
});

// Handle Google OAuth callback (commented by Smeet Patel)
router.post('/google/callback', [
  body('code').notEmpty().withMessage('Authorization code is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { code } = req.body;

    // Exchange authorization code for tokens (commented by Smeet Patel)
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    // Get user info (commented by Smeet Patel)
    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
    const { data: userInfo } = await oauth2.userinfo.get();

    
    // For demo purposes, returning tokens to frontend (commented by Smeet Patel)
    res.json({
      success: true,
      user: {
        id: userInfo.id,
        email: userInfo.email,
        name: userInfo.name,
        picture: userInfo.picture
      },
      tokens: {
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expiry_date: tokens.expiry_date
      }
    });
  } catch (error) {
    console.error('OAuth callback error:', error);
    res.status(400).json({ 
      error: 'Authentication failed',
      message: error.message
    });
  }
});

// GET handler: (commented by Smeet Patel)
router.get('/google/callback', async (req, res) => {
  const code = req.query.code;
  if (!code) {
    return res.status(400).json({ error: 'No code provided' });
  }
  // This will reuse your POST handler's logic: (commented by Smeet Patel)
  req.body = { code };
  // Now call your POST logic
  try {
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);
    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
    const { data: userInfo } = await oauth2.userinfo.get();
    res.json({
      success: true,
      user: {
        id: userInfo.id,
        email: userInfo.email,
        name: userInfo.name,
        picture: userInfo.picture
      },
      tokens: {
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expiry_date: tokens.expiry_date
      }
    });
  } catch (error) {
    console.error('OAuth callback error:', error);
    res.status(400).json({
      error: 'Authentication failed',
      message: error.message
    });
  }
});


// Refresh access token (commented by Smeet Patel)
router.post('/refresh', [
  body('refreshToken').notEmpty().withMessage('Refresh token is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { refreshToken } = req.body;

    oauth2Client.setCredentials({
      refresh_token: refreshToken
    });

    const { credentials } = await oauth2Client.refreshAccessToken();

    res.json({
      success: true,
      tokens: {
        access_token: credentials.access_token,
        expiry_date: credentials.expiry_date
      }
    });
  } catch (error) {
    console.error('Token refresh error:', error);
    res.status(400).json({ 
      error: 'Token refresh failed',
      message: error.message
    });
  }
});

// Logout - revoke tokens
router.post('/logout', [
  body('accessToken').notEmpty().withMessage('Access token is required')
], async (req, res) => {
  try {
    const { accessToken } = req.body;

    oauth2Client.setCredentials({
      access_token: accessToken
    });

    await oauth2Client.revokeCredentials();

    res.json({ success: true, message: 'Successfully logged out' });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(400).json({ 
      error: 'Logout failed',
      message: error.message
    });
  }
});

module.exports = router;