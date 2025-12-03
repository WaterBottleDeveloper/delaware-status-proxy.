// server.js (Node.js Proxy - Parallel "Safety First" System)
const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;
const TIMEOUT_MS = 5000; // 5 seconds per site
const DISTRICT_NAME_CLEAN = 'Delaware City Schools';

// Simple in-memory cache to avoid re-scraping constantly
const CACHE_TTL_MS = 60_000; // 60 seconds
let lastResult = null;
let lastResultTime = 0;

app.use(cors());

// --- HELPER: Generic Text Scanner ---
const checkTextForStatus = (text, districtName) => {
    const cleanText = text.toUpperCase();
    const cleanDistrict = districtName.toUpperCase();

    if (
        cleanText.includes(cleanDistrict) ||
        cleanText.includes('DELAWARE CITY SCHOOLS') ||
        cleanText.includes('DELAWARE CITY SCHOOL DISTRICT')
    ) {
        if (cleanText.includes('CLOSED') || cleanText.includes('CLOSURE')) return 'CLOSED';
        if (
            cleanText.includes('DELAY') ||
            cleanText.includes('DELAYED') ||
            cleanText.includes('TWO-HOUR') ||
            cleanText.includes('2-HOUR')
        ) {
            return 'DELAYED';
        }
    }
    return 'OPEN';
};

// --- SCRAPERS ---
const SCRAPERS = [
    // 1) Delaware City Schools homepage (official source)
    {
        name: 'DCS Homepage',
        role: 'official',
        url: 'https://www.dcs.k12.oh.us/',
        scrape: async (url) => {
            console.log('Scraping: DCS Homepage');
            const response = await axios.get(url, { timeout: TIMEOUT_MS });
            const $ = cheerio.load(response.data);

            const bannerText = $('.alert, .notification, .banner, .announcement').text().toUpperCase();
            const bodyText = $('body').text().toUpperCase();
            const text = bannerText || bodyText;

            if (text.includes('CLOSED') || text.includes('CLOSURE')) return 'CLOSED';
            if (
                text.includes('DELAY') ||
                text.includes('DELAYED') ||
                text.includes('TWO-HOUR') ||
                text.includes('2-HOUR')
            ) {
                return 'DELAYED';
            }

            return 'OPEN';
        }
    },

    // 2) WBNS 10TV
    {
        name: 'WBNS 10TV',
        role: 'media',
        url: 'https://www.10tv.com/closings',
        scrape: async (url) => {
            console.log('Scraping: WBNS 10TV');
            const response = await axios.get(url, {
                timeout: TIMEOUT_MS,
                headers: { 'User-Agent': 'Mozilla/5.0' }
            });
            const bodyText = cheerio.load(response.data)('body').text();
            return checkTextForStatus(bodyText, DISTRICT_NAME_CLEAN);
        }
    },

    // 3) NBC4 WCMH
    {
        name: 'NBC4 WCMH',
        role: 'media',
        url: 'https://www.nbc4i.com/weather/closings/',
        scrape: async (url) => {
            console.log('Scraping: NBC4 WCMH');
            const response = await axios.get(url, {
                timeout: TIMEOUT_MS,
                headers: { 'User-Agent': 'Mozilla/5.0' }
            });
            const bodyText = cheerio.load(response.data)('body').text();
            return checkTextForStatus(bodyText, DISTRICT_NAME_CLEAN);
        }
    },

    // 4) WSYX ABC6
    {
        name: 'WSYX ABC6',
        role: 'media',
        url: 'https://abc6onyourside.com/weather/closings',
        scrape: async (url) => {
            console.log('Scraping: WSYX ABC6');
            const response = await axios.get(url, {
                timeout: TIMEOUT_MS,
                headers: { 'User-Agent': 'Mozilla/5.0' }
            });
            const bodyText = cheerio.load(response.data)('body').text();
            return checkTextForStatus(bodyText, DISTRICT_NAME_CLEAN);
        }
    },

    // 5) 610 WTVN Radio
    {
        name: '610 WTVN Radio',
        role: 'media',
        url: 'https://610wtvn.iheart.com/featured/central-ohio-school-and-business-closings-and-delays/',
        scrape: async (url) => {
            console.log('Scraping: 610 WTVN');
            const response = await axios.get(url, { timeout: TIMEOUT_MS });
            const bodyText = cheerio.load(response.data)('body').text();
            return checkTextForStatus(bodyText, DISTRICT_NAME_CLEAN);
        }
    },

    // 6) Delaware Gazette
    {
        name: 'Delaware Gazette',
        role: 'media',
        url: 'https://www.delgazette.com',
        scrape: async (url) => {
            console.log('Scraping: Delaware Gazette');
            const response = await axios.get(url, { timeout: TIMEOUT_MS });
            const bodyText = cheerio.load(response.data)('body').text();
            return checkTextForStatus(bodyText, DISTRICT_NAME_CLEAN);
        }
    },

    // 7) SchoolClosings.org
    {
        name: 'SchoolClosings.org Ohio',
        role: 'aggregate',
        url: 'https://www.schoolclosings.org/ohio/',
        scrape: async (url) => {
            console.log('Scraping: SchoolClosings.org Ohio');
            const response = await axios.get(url, { timeout: TIMEOUT_MS });
            const bodyText = cheerio.load(response.data)('body').text();
            return checkTextForStatus(bodyText, DISTRICT_NAME_CLEAN);
        }
    }
];

// --- DECISION LOGIC: Equal votes for all sources ---
function decideStatus(results) {
    // Only look at successful statuses
    const nonError = results.filter(r =>
        r.status === 'OPEN' || r.status === 'CLOSED' || r.status === 'DELAYED'
    );

    if (nonError.length === 0) {
        return {
            status: 'UNKNOWN',
            source: 'No successful sources'
        };
    }

    const openList = nonError.filter(r => r.status === 'OPEN');
    const closedList = nonError.filter(r => r.status === 'CLOSED');
    const delayedList = nonError.filter(r => r.status === 'DELAYED');

    const openCount = openList.length;
    const closedCount = closedList.length;
    const delayedCount = delayedList.length;

    console.log(`Vote counts -> OPEN: ${openCount}, CLOSED: ${closedCount}, DELAYED: ${delayedCount}`);

    // 1) Majority CLOSED
    if (closedCount > openCount && closedCount >= delayedCount && closedCount > 0) {
        return {
            status: 'CLOSED',
            source: `${closedList[0].name} (majority of ${closedCount} sources)`
        };
    }

    // 2) Majority DELAYED
    if (delayedCount > openCount && delayedCount > closedCount && delayedCount > 0) {
        return {
            status: 'DELAYED',
            source: `${delayedList[0].name} (majority of ${delayedCount} sources)`
        };
    }

    // 3) Otherwise, if there is at least one OPEN, treat as OPEN
    if (openCount > 0) {
        return {
            status: 'OPEN',
            source: `Consensus / plurality of ${openCount} sources`
        };
    }

    // 4) Fallback: confusing situation
    return {
        status: 'UNKNOWN',
        source: 'Conflicting results'
    };
}

// --- CORE LOGIC: Parallel Execution ---
async function getSchoolStatus() {
    console.log(`Starting parallel scrape of ${SCRAPERS.length} sources...`);

    const checkPromises = SCRAPERS.map(async (scraper) => {
        try {
            const status = await scraper.scrape(scraper.url);
            console.log(`Scraper "${scraper.name}" returned: ${status}`);
            return { name: scraper.name, role: scraper.role, status };
        } catch (error) {
            console.error(`Scraper "${scraper.name}" error:`, error.message);
            return { name: scraper.name, role: scraper.role, status: 'ERROR', error: error.message };
        }
    });

    const results = await Promise.all(checkPromises);
    const decision = decideStatus(results);

    return {
        status: decision.status,
        timestamp: new Date().toISOString(),
        source: decision.source,
        results_summary: results
    };
}

app.get('/', (req, res) => {
    res.send('Parallel Proxy Running. Hit /status to check.');
});

app.get('/status', async (req, res) => {
    try {
        const now = Date.now();

        // Serve cached result if it's fresh
        if (lastResult && now - lastResultTime < CACHE_TTL_MS) {
            return res.json({
                ...lastResult,
                cached: true
            });
        }

        const data = await getSchoolStatus();
        lastResult = data;
        lastResultTime = now;

        res.json({
            ...data,
            cached: false
        });
    } catch (err) {
        console.error('Error in /status handler:', err);
        res.status(500).json({ status: 'ERROR', error: 'Internal server error' });
    }
});

app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
});
