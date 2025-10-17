const express = require('express');
const { google } = require('googleapis');
const { body, validationResult } = require('express-validator');
const moment = require('moment');
const router = express.Router();

// Middleware to authenticate requests (used for list/conflict/upcoming, not for create) (commented by Smeet Patel)
const authenticateToken = (req, res, next) => {
  const { accessToken } = req.body;
  if (!accessToken) {
    return res.status(401).json({ error: 'Access token required' });
  }
  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({ access_token: accessToken });
  req.auth = oauth2Client;
  next();
};

// Get user's calendars (commented by Smeet Patel)
router.post('/list', authenticateToken, async (req, res) => {
  try {
    const calendar = google.calendar({ version: 'v3', auth: req.auth });
    const response = await calendar.calendarList.list();
    const calendars = response.data.items.map(cal => ({
      id: cal.id,
      summary: cal.summary,
      primary: cal.primary || false,
      accessRole: cal.accessRole
    }));
    res.json({ calendars });
  } catch (error) {
    console.error('Calendar list error:', error);
    res.status(400).json({
      error: 'Failed to fetch calendars',
      message: error.message
    });
  }
});

// Function to build OAuth2Client from tokens for real event creation (commented by Smeet Patel)
function getOAuth2Client(tokens) {
  const oAuth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
  oAuth2Client.setCredentials(tokens);
  return oAuth2Client;
}

// REAL Google Calendar Event Creation (NO simulation!) (commented by Smeet Patel)
router.post('/events', async (req, res) => {
  try {
    // "tokens" must be an object containing at least { access_token, ... }
    const { title, startDateTime, endDateTime, description, attendees, tokens } = req.body;
    if (!tokens || !tokens.access_token) {
      return res.status(401).json({ error: 'Google OAuth2 tokens required.' });
    }

    const oAuth2Client = getOAuth2Client(tokens);
    const calendar = google.calendar({ version: 'v3', auth: oAuth2Client });

    const event = {
      summary: title,
      description: description || '',
      start: {
        dateTime: startDateTime,
        timeZone: 'Asia/Kolkata'
      },
      end: {
        dateTime: endDateTime,
        timeZone: 'Asia/Kolkata'
      },
      attendees: Array.isArray(attendees)
        ? attendees.map(email => ({ email }))
        : [],
      conferenceData: {
        createRequest: {
          requestId: 'meet-' + Date.now(),
          conferenceSolutionKey: { type: 'hangoutsMeet' }
        }
      },
      reminders: {
        useDefault: false,
        overrides: [
          { method: 'email', minutes: 24 * 60 },
          { method: 'popup', minutes: 10 }
        ]
      }
    };

    const response = await calendar.events.insert({
      calendarId: 'primary',
      resource: event,
      conferenceDataVersion: 1,
      sendUpdates: 'all'
    });

    res.json({ success: true, event: response.data });
  } catch (error) {
    console.error('Event creation error:', error);
    res.status(500).json({ success: false, error: 'Failed to create event.' });
  }
});

// Get upcoming events (commented by Smeet Patel)
router.post('/events/upcoming', [
  body('accessToken').notEmpty(),
  body('maxResults').optional().isInt({ min: 1, max: 50 })
], authenticateToken, async (req, res) => {
  try {
    const { maxResults = 10, calendarId = 'primary' } = req.body;
    const calendar = google.calendar({ version: 'v3', auth: req.auth });

    const response = await calendar.events.list({
      calendarId: calendarId,
      timeMin: new Date().toISOString(),
      maxResults: maxResults,
      singleEvents: true,
      orderBy: 'startTime'
    });

    const events = response.data.items.map(event => ({
      id: event.id,
      title: event.summary,
      start: event.start.dateTime || event.start.date,
      end: event.end.dateTime || event.end.date,
      description: event.description,
      htmlLink: event.htmlLink,
      meetLink: event.conferenceData?.entryPoints?.[0]?.uri || null
    }));

    res.json({ events });
  } catch (error) {
    console.error('Upcoming events error:', error);
    res.status(400).json({
      error: 'Failed to fetch events',
      message: error.message
    });
  }
});

// Check for scheduling conflicts (commented by Smeet Patel)
router.post('/events/check-conflict', [
  body('accessToken').notEmpty(),
  body('startDateTime').notEmpty(),
  body('endDateTime').notEmpty()
], authenticateToken, async (req, res) => {
  try {
    const { startDateTime, endDateTime, calendarId = 'primary' } = req.body;
    const calendar = google.calendar({ version: 'v3', auth: req.auth });

    const response = await calendar.events.list({
      calendarId: calendarId,
      timeMin: startDateTime,
      timeMax: endDateTime,
      singleEvents: true
    });

    const conflicts = response.data.items.length > 0;

    res.json({
      hasConflict: conflicts,
      conflictingEvents: conflicts ? response.data.items.map(event => ({
        id: event.id,
        title: event.summary,
        start: event.start.dateTime || event.start.date,
        end: event.end.dateTime || event.end.date
      })) : []
    });
  } catch (error) {
    console.error('Conflict check error:', error);
    res.status(400).json({
      error: 'Failed to check conflicts',
      message: error.message
    });
  }
});

module.exports = router;
