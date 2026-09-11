const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');
const matter = require('gray-matter');
require('dotenv').config({ path: path.resolve(__dirname, '../api/.env') });

// --- flags ---
const DRY_RUN = process.argv.includes('--dry-run');

// Fixed number of (blank) manual goal slots. The user fills these in on the
// site or in Obsidian — the cron no longer generates tasks/goals.
const DAILY_SLOTS = 3;
const WEEKLY_SLOTS = 5;

// --- date helpers ---
const now = new Date();

const pad = (n) => String(n).padStart(2, '0');
const toYMD = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

const TODAY = toYMD(now);
const DAY_OF_WEEK = now.toLocaleDateString('en-US', { weekday: 'long' });

// ISO week id (weeks start Monday; week 1 contains the first Thursday of January).
function getWeekId(date = now) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

const WEEK_ID = getWeekId(now);

// Monday and Sunday of the current ISO week (local dates)
const mondayOffset = (now.getDay() === 0 ? -6 : 1 - now.getDay());
const weekStartDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + mondayOffset);
const weekEndDate = new Date(weekStartDate.getFullYear(), weekStartDate.getMonth(), weekStartDate.getDate() + 6);
const WEEK_START = toYMD(weekStartDate);
const WEEK_END = toYMD(weekEndDate);

// --- paths ---
const VAULT = process.env.VAULT_PATH;
// Where the weather in the daily briefing is for, and the zone the vault's
// date keys use. Defaults are deliberately neutral rather than someone's home.
const LATITUDE = process.env.LATITUDE || '0';
const LONGITUDE = process.env.LONGITUDE || '0';
const TIMEZONE = process.env.TIMEZONE || 'UTC';
const ROOT = path.resolve(VAULT, '..');
const TODAY_FILE = path.join(VAULT, 'Daily-Progress', `${TODAY}.md`);
const WEEK_FILE = path.join(VAULT, 'Focus', `${WEEK_ID}.md`);
// Tracked in the repo so the deployed (Vercel) app can read it via GitHub.
const BRIEFING_CACHE = path.join(ROOT, 'data', 'briefing.json');
const LOG_FILE = '/tmp/secondbrain-cron.log';

// --- logging ---
function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  try {
    fs.appendFileSync(LOG_FILE, line + '\n');
  } catch (e) {
    // best-effort logging
  }
  console.log(line);
}

// Fixed-count blank checkbox slots (manual goals the user fills in).
function blankSlots(n) {
  return Array.from({ length: n }, () => '- [ ]').join('\n');
}

function buildDailyContent() {
  const generatedAt = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
  const frontmatter = {
    date: TODAY,
    day_of_week: DAY_OF_WEEK,
    week: WEEK_ID,
    focus_score: null,
    energy: null,
    mood: '',
    deep_work_hours: null,
    habit_sleep_8h: false,
    habit_nutrition: false,
    habit_difficult_task: false,
    habit_creative_task: false,
    habit_reading: false,
    habit_exercise: false,
    habit_social_media: false,
    habit_stretching: false,
    sleep_bedtime: '',
    sleep_wake: '',
    sleep_quality: null,
    sleep_factors: [],
    supplements_taken: false,
    calories: null,
    protein: null,
    carbs: null,
    fat: null,
    fiber: null,
    water: null,
    sugar: null,
    routine_am_no_phone: false,
    routine_am_sunlight: false,
    routine_am_breakfast: false,
    routine_pm_no_phone: false,
    routine_pm_screens_off: false,
    routine_pm_prepare: false,
    reflection: '',
    weekly_goals_progress: '',
    generated_at: generatedAt,
  };
  // Blank daily goal slots — filled in manually, editable on the site and as
  // native Obsidian checkboxes.
  const body = `\n## Tasks\n${blankSlots(DAILY_SLOTS)}\n`;
  // Safeguard: always wrap the date in quotes so YAML never parses it as a Date.
  return matter.stringify(body, frontmatter).replace(
    /^date:\s*(["']?)(\d{4}-\d{2}-\d{2})\1\s*$/m,
    "date: '$2'"
  );
}

function buildWeeklyContent() {
  const frontmatter = { week: WEEK_ID, start_date: WEEK_START, end_date: WEEK_END };
  // Blank weekly goal slots — filled in manually.
  const body = `\n## Goals\n${blankSlots(WEEKLY_SLOTS)}\n`;
  return matter.stringify(body, frontmatter);
}

// --- briefing (weather + markets + news) ---
function weatherCodeToString(code) {
  const map = {
    0: 'Clear sky',
    1: 'Mainly clear',
    2: 'Partly cloudy',
    3: 'Overcast',
    45: 'Foggy',
    48: 'Foggy',
    51: 'Drizzle',
    53: 'Drizzle',
    55: 'Drizzle',
    61: 'Rain',
    63: 'Rain',
    65: 'Rain',
    66: 'Freezing rain',
    67: 'Freezing rain',
    71: 'Snow',
    73: 'Snow',
    75: 'Snow',
    77: 'Snow grains',
    80: 'Rain showers',
    81: 'Rain showers',
    82: 'Rain showers',
    85: 'Snow showers',
    86: 'Snow showers',
    95: 'Thunderstorm',
    96: 'Thunderstorm with hail',
    99: 'Thunderstorm with hail',
  };
  return map[code] || 'Unknown';
}

function extractJson(text) {
  let t = (text || '').trim();
  if (t.startsWith('```')) {
    t = t.replace(/^```[a-zA-Z]*\s*/, '').replace(/\s*```$/, '').trim();
  }
  try {
    return JSON.parse(t);
  } catch (e) {
    // The model may wrap the object in prose; grab the outermost braces.
    const start = t.indexOf('{');
    const end = t.lastIndexOf('}');
    if (start !== -1 && end > start) {
      return JSON.parse(t.slice(start, end + 1));
    }
    throw e;
  }
}

// Fetch each headline's Open Graph image so the briefing can show article art.
// Best-effort per headline: a site that blocks us, redirects oddly, or omits the
// tag just yields image: null, and the UI falls back to a gradient tile.
const INDEX_SYMBOLS = [
  { symbol: '^GSPC', name: 'S&P 500' },
  { symbol: '^IXIC', name: 'Nasdaq' },
  { symbol: '^DJI', name: 'Dow Jones' },
];

// YYYY-MM-DD for an instant as it fell in New York, so sessions are keyed by
// the exchange's own calendar rather than the runner's UTC one.
function etDate(ms) {
  return new Date(ms).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
}

// Closing levels for the most recent COMPLETED session. Today's bar is dropped
// on purpose: the cron runs before the US close, so today is still open — the
// same rule the model used to be asked to reason about, applied directly.
// Returns null rather than throwing so a bad day degrades to "Markets
// unavailable" instead of taking the briefing down.
async function fetchIndices() {
  const todayET = etDate(Date.now());

  const results = await Promise.all(
    INDEX_SYMBOLS.map(async ({ symbol, name }) => {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 10000);
        const res = await fetch(
          `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}` +
            '?interval=1d&range=1mo',
          { signal: controller.signal, headers: { 'User-Agent': 'Mozilla/5.0' } }
        );
        clearTimeout(timer);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const d = await res.json();
        const r = d.chart && d.chart.result && d.chart.result[0];
        if (!r || !r.timestamp) throw new Error('no chart result');
        const closes = ((r.indicators || {}).quote || [{}])[0].close || [];

        // Holidays and half-formed bars both show up as null closes.
        const bars = r.timestamp
          .map((t, i) => ({ date: etDate(t * 1000), close: closes[i] }))
          .filter((b) => b.close != null && b.date < todayET);
        if (bars.length < 2) throw new Error('not enough closed sessions');

        const last = bars[bars.length - 1];
        const prev = bars[bars.length - 2];
        const change = ((last.close - prev.close) / prev.close) * 100;
        return {
          session_date: last.date,
          index: {
            name,
            value: Math.round(last.close * 100) / 100,
            change_pct: Math.round(change * 100) / 100,
            direction: change >= 0 ? 'up' : 'down',
          },
        };
      } catch (error) {
        log(`  index ${name} failed: ${error.message}`);
        return null;
      }
    })
  );

  const ok = results.filter(Boolean);
  if (ok.length === 0) return null;
  return { session_date: ok[0].session_date, indices: ok.map((r) => r.index) };
}

async function attachHeadlineImages(headlines) {
  const OG_RE =
    /<meta[^>]+(?:property|name)=["'](?:og:image(?::secure_url)?|twitter:image)["'][^>]*>/i;
  const CONTENT_RE = /content=["']([^"']+)["']/i;

  return Promise.all(
    headlines.map(async (h) => {
      if (!h || typeof h.url !== 'string' || !/^https?:\/\//.test(h.url)) {
        return { ...h, image: null };
      }
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 8000);
        const res = await fetch(h.url, {
          signal: controller.signal,
          redirect: 'follow',
          headers: {
            // Plain fetch is refused by a lot of news sites.
            'User-Agent':
              'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
              '(KHTML, like Gecko) Chrome/124.0 Safari/537.36',
            Accept: 'text/html,application/xhtml+xml',
          },
        });
        clearTimeout(timer);
        if (!res.ok) return { ...h, image: null };

        // og:image lives in <head>; cap the read so a huge page can't stall the cron.
        const html = (await res.text()).slice(0, 250000);
        const tag = html.match(OG_RE);
        if (!tag) return { ...h, image: null };
        const content = tag[0].match(CONTENT_RE);
        if (!content) return { ...h, image: null };

        // The attribute is HTML-escaped in the source, so query separators come
        // through as &amp; — left as-is the CDN rejects the request.
        const raw = content[1]
          .replace(/&amp;/g, '&')
          .replace(/&#(?:38|x26);/gi, '&')
          .replace(/&quot;/g, '"')
          .replace(/&#(?:39|x27);/gi, "'")
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>');

        // Resolve protocol-relative and root-relative URLs against the article.
        const image = new URL(raw, h.url).toString();
        return { ...h, image };
      } catch (error) {
        log(`  og:image failed for ${h.url}: ${error.message}`);
        return { ...h, image: null };
      }
    })
  );
}

// Never throws — failures degrade to null fields so the cron can't crash.
async function generateBriefing() {
  const generatedAt = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
  let weather = null;
  let market = null;
  let headlines = null;
  let briefingError = null;

  // STEP A — weather (Open-Meteo, no API key)
  try {
    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${LATITUDE}&longitude=${LONGITUDE}` +
      '&current=temperature_2m,apparent_temperature,weathercode,relative_humidity_2m,wind_speed_10m' +
      '&hourly=temperature_2m,weathercode,precipitation_probability' +
      '&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,weathercode' +
      `&timezone=${encodeURIComponent(TIMEZONE)}&forecast_days=7`;
    const res = await fetch(url);
    const d = await res.json();
    const c = d.current || {};
    const daily = d.daily || {};
    const hourly = d.hourly || {};
    const code = c.weathercode != null ? c.weathercode : c.weather_code;

    // Hourly arrays start at midnight local; slice the next 12 hours from now
    // so the UI strip always begins at the current hour.
    const startIdx = Math.max(0, (hourly.time || []).findIndex((t) => new Date(t) >= now));
    const hourlyCodes = hourly.weathercode || hourly.weather_code || [];
    const forecast_hourly = (hourly.time || [])
      .slice(startIdx, startIdx + 12)
      .map((t, i) => ({
        time: t,
        temperature: (hourly.temperature_2m || [])[startIdx + i],
        conditions: weatherCodeToString(hourlyCodes[startIdx + i]),
        precip_chance: (hourly.precipitation_probability || [])[startIdx + i],
      }));

    const dailyCodes = daily.weathercode || daily.weather_code || [];
    const forecast_daily = (daily.time || []).slice(0, 7).map((t, i) => ({
      date: t,
      high: (daily.temperature_2m_max || [])[i],
      low: (daily.temperature_2m_min || [])[i],
      conditions: weatherCodeToString(dailyCodes[i]),
      precipitation_mm: (daily.precipitation_sum || [])[i],
    }));

    weather = {
      temperature: c.temperature_2m,
      feels_like: c.apparent_temperature,
      high: daily.temperature_2m_max[0],
      low: daily.temperature_2m_min[0],
      conditions: weatherCodeToString(code),
      precipitation_mm: daily.precipitation_sum[0],
      humidity: c.relative_humidity_2m,
      wind_kph: c.wind_speed_10m,
      forecast_hourly,
      forecast_daily,
    };
  } catch (error) {
    log('Briefing weather failed: ' + error.message);
  }

  // STEP B — index levels (Yahoo, no model involved)
  // Asking Claude to search for the numbers was almost the entire token bill:
  // each search re-sends every earlier result, so a 7-search run cost ~87k
  // tokens, and capping the searches just made it answer with nulls. The chart
  // API returns the same figures exactly, for free, in one request.
  let sessionDate = null;
  try {
    const fetched = await fetchIndices();
    if (fetched) {
      sessionDate = fetched.session_date;
      market = { session_date: fetched.session_date, indices: fetched.indices, notable: '' };
    }
  } catch (error) {
    log('Briefing indices failed: ' + error.message);
  }

  // STEP C — headlines and the market comment (Claude with web search)
  try {
    // An unset GitHub secret interpolates to an empty string, which the API
    // rejects as a missing header. Say that plainly rather than surfacing a
    // raw 401 the dashboard can't explain.
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error(
        'ANTHROPIC_API_KEY is not configured — set it as a repository secret ' +
          '(Settings > Secrets and variables > Actions)'
      );
    }
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1000,
        messages: [
          {
            role: 'user',
            content:
              "Search for today's top US tech and finance news headlines. " +
              'Then reply with a single JSON object and nothing else:\n' +
              '{\n' +
              '  "notable": "one sentence on the biggest market mover or theme in the latest session",\n' +
              '  "headlines": [\n' +
              '    { "title": "headline text", "source": "Reuters", "url": "https://..." }\n' +
              '  ]\n' +
              '}\n' +
              'Include exactly 5 headlines with real URLs from your search results. ' +
              'In "notable", describe the driver or theme only — do not quote index levels or ' +
              'percentages, which are shown next to it from an exact source and will disagree.',
          },
        ],
        // Without a cap the model decides how many searches to run — observed
        // between 2 and 10, and the cost grows with the square of that number
        // because every round re-sends all previous results.
        tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 2 }],
      }),
    });
    const data = await res.json();
    if (data.type === 'error') {
      throw new Error(`anthropic ${data.error && data.error.type}: ${data.error && data.error.message}`);
    }

    // Searches drive the bill, so record them: if this creeps back up the log
    // says so without needing to reproduce the run.
    const u = data.usage || {};
    log(
      `  briefing tokens: in=${u.input_tokens} out=${u.output_tokens} ` +
        `searches=${(u.server_tool_use || {}).web_search_requests ?? 0}`
    );

    // With web search the reply is a run of text blocks interleaved with tool
    // calls — the early ones are search narration ("I'll look that up..."), and
    // only the last one holds the answer. Joining them all fed prose into the
    // JSON parser, which is why this step produced null every single day.
    const textBlocks = (data.content || []).filter((b) => b.type === 'text').map((b) => b.text);
    let parsed = null;
    let parseError = null;
    for (let i = textBlocks.length - 1; i >= 0 && parsed === null; i--) {
      try {
        parsed = extractJson(textBlocks[i]);
      } catch (e) {
        parseError = e;
      }
    }
    if (parsed === null) {
      throw new Error(
        `no JSON in ${textBlocks.length} text block(s)` +
          (parseError ? ` (${parseError.message})` : '') +
          `; stop_reason=${data.stop_reason}`
      );
    }

    // The indices already came from Yahoo; the model only supplies the prose.
    if (market && typeof parsed.notable === 'string') market.notable = parsed.notable;
    headlines = Array.isArray(parsed.headlines) ? parsed.headlines : null;
    if (headlines) headlines = await attachHeadlineImages(headlines);
  } catch (error) {
    briefingError = error.message;
    log('Briefing news failed: ' + error.message);
  }

  // STEP C — save
  try {
    const briefing = { date: TODAY, generated_at: generatedAt, weather, market, headlines, error: briefingError };
    fs.mkdirSync(path.dirname(BRIEFING_CACHE), { recursive: true });
    fs.writeFileSync(BRIEFING_CACHE, JSON.stringify(briefing, null, 2));
    log('Briefing written: ' + BRIEFING_CACHE);
  } catch (error) {
    log('Briefing write failed: ' + error.message);
  }
}

async function main() {
  const dailyExists = fs.existsSync(TODAY_FILE);
  let dailyCreated = false;
  let weeklyCreated = false;

  // --- STEP 1: daily file with blank goal slots (skip if it already exists) ---
  if (dailyExists && !DRY_RUN) {
    log('Daily file already exists, skipping daily creation: ' + TODAY_FILE);
  } else {
    const content = buildDailyContent();
    if (DRY_RUN) {
      log('dry-run: would write ' + TODAY_FILE + '\n' + content);
      if (dailyExists) log('dry-run: (real run would SKIP — daily file already exists)');
    } else {
      fs.writeFileSync(TODAY_FILE, content);
      dailyCreated = true;
      log('Created: ' + TODAY_FILE);
    }
  }

  // --- STEP 2: weekly goals file with blank slots (first run of the week) ---
  if (!fs.existsSync(WEEK_FILE)) {
    const weeklyContent = buildWeeklyContent();
    if (DRY_RUN) {
      log('dry-run: would write ' + WEEK_FILE + '\n' + weeklyContent);
    } else {
      fs.writeFileSync(WEEK_FILE, weeklyContent);
      weeklyCreated = true;
      log('Created weekly goals: ' + WEEK_ID);
    }
  } else if (DRY_RUN) {
    log('dry-run: weekly file already exists, would skip: ' + WEEK_FILE);
  }

  // --- STEP 3: daily briefing (weather + markets + news) ---
  // Runs regardless of whether daily/weekly were created. Never crashes the cron.
  if (DRY_RUN) {
    log('dry-run: skipping briefing (would fetch weather + markets/news)');
  } else {
    try {
      await generateBriefing();
    } catch (error) {
      log('Briefing step failed: ' + error.message);
    }
  }

  // --- STEP 4: git commit and push (new files + the daily briefing) ---
  if (DRY_RUN) {
    log('dry-run: skipping git operations');
  } else {
    const paths = [];
    if (dailyCreated) paths.push(`obsidian-vault/Daily-Progress/${TODAY}.md`);
    if (weeklyCreated) paths.push(`obsidian-vault/Focus/${WEEK_ID}.md`);
    if (fs.existsSync(BRIEFING_CACHE)) paths.push('data/briefing.json');
    for (const p of paths) {
      execSync(`git -C "${ROOT}" add "${p}"`, { stdio: 'inherit' });
    }
    // Commit only if something is actually staged.
    let staged = true;
    try {
      execSync(`git -C "${ROOT}" diff --cached --quiet`);
      staged = false;
    } catch (e) {
      staged = true;
    }
    if (staged) {
      const msg = dailyCreated
        ? `Daily progress: ${TODAY}`
        : weeklyCreated
        ? `Weekly goals: ${WEEK_ID}`
        : `Briefing: ${TODAY}`;
      execSync(`git -C "${ROOT}" commit -m "${msg}"`, { stdio: 'inherit' });
      try {
        execSync(`git -C "${ROOT}" push`, { stdio: 'inherit' });
      } catch (error) {
        log('Push failed (will retry next run): ' + error.message);
      }
    } else {
      log('Nothing new to commit');
    }
  }

  log('Done.');
}

// Run only when invoked directly, so the pieces above can be imported and
// exercised in isolation (e.g. testing the briefing without a full cron run).
if (require.main === module) {
  main();
}

module.exports = { generateBriefing, attachHeadlineImages };
