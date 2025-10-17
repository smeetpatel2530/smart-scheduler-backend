const express = require('express');
const chrono = require('chrono-node');
const moment = require('moment');
const { body, validationResult } = require('express-validator');
const router = express.Router();

// Fallback parsing function (uses regex, chrono-node, keyword logic) (commented by Smeet Patel)
function fallbackParse(command) {
  const result = {
    title: 'Untitled Event',
    date: null,
    time: null,
    duration: null,
    attendees: [],
    description: null,
    startDateTime: null,
    endDateTime: null
  };

  // Extract attendees (look for emails) (commented by Smeet Patel)
  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  const emails = command.match(emailRegex);
  if (emails) result.attendees = emails;

  // Extract time (commented by Smeet Patel)
  const timeMatch = command.match(/(\d{1,2}(?::\d{2})?\s*(?:AM|PM|am|pm))/i);
  if (timeMatch) result.time = timeMatch[1];

  // Extract date (commented by Smeet Patel)
  const dateWords = ['today', 'tomorrow', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday', 'next', 'this'];
  for (const day of dateWords) {
    if (command.toLowerCase().includes(day)) {
      result.date = command.match(new RegExp(`\\b${day}\\b`, 'i')) ? day : result.date;
    }
  }

  // Extract duration (commented by Smeet Patel)
  const durationMatch = command.match(/(\d{1,2})\s*(hour|hr|minute|min)s?/i);
  if (durationMatch) {
    result.duration = `${durationMatch[1]} ${durationMatch[2]}`;
  }

  // Extract event title (everything after "schedule" or "create", up to a date/at/with)
  const titlePattern = /(?:schedule|create|book|set up) (?:a )?(.+?)(?: with| for| at| on|,|\.|$)/i;
  const titleMatch = command.match(titlePattern);
  if (titleMatch) result.title = titleMatch[1].trim();

  // Use chrono to parse datetime (commented by Smeet Patel)
  if (result.date && result.time) {
    const chronoParsed = chrono.parseDate(`${result.date} ${result.time}`);
    if (chronoParsed) {
      result.startDateTime = moment(chronoParsed).toISOString();
      if (result.duration) {
        const durationValue = parseInt(durationMatch ? durationMatch[1] : 1);
        const durationUnit = (durationMatch && durationMatch[2].toLowerCase().startsWith('h')) ? 'hours' : 'minutes';
        result.endDateTime = moment(chronoParsed).add(durationValue, durationUnit).toISOString();
      } else {
        result.endDateTime = moment(chronoParsed).add(1, 'hour').toISOString();
      }
    }
  }

  return result;
}

// POST endpoint -- uses only fallback parsing, always (commented by Smeet Patel)
router.post('/parse-schedule', [
  body('command').notEmpty().withMessage('Command is required'),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    const { command } = req.body;

    // Always use fallback parsing (commented by Smeet Patel)
    const parsed = fallbackParse(command);

    res.json({
      success: true,
      parsed: {
        ...parsed,
        originalCommand: command,
        testMode: true
      },
      confidence: parsed.startDateTime ? 0.7 : 0.3
    });
  } catch (error) {
    res.status(500).json({ error: 'Parsing failed' });
  }
});

module.exports = router;
