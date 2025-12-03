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

    // Check for district mentions
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

// --- SOURCES ---
const SCRAPERS = [
    // 1) Delaware City Schools homepage (official source)
    {
        name: 'DCS Homepage',
        url: 'https://www.dcs.k12.oh.us/',
        scrape: async (url) => {
            console.log('Scraping: DCS Homepage');
            const response = await axios.get(url, { timeout: TIMEOUT_MS });
            const $ = cheerio.load(response.data);

            // Look for obvious alert/banner text
            const bannerText = $('.alert, .notification, .banner, .announcement').text().toUpperCase();
            const bodyText = $('body').text().toUpperCase();
            const text = (bannerText || bodyText);

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
        url: 'https://www.10tv.com/closings',
        scrape: async (url) => {
            console.log('Scraping: WBNS 10TV Closings');
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
        url: 'https://www.nbc4i.com/weather/closings/',
        scrape: async (url) => {
            console.log('Scraping: NBC4 WCMH Closings');
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
        url: 'https://abc6onyourside.com/weather/closings',
        scrape: async (url) => {
            console.log('Scraping: WSYX ABC6 Closings');
            const response = await axios.get(url, {
                timeout: TIMEOUT_MS,
                headers: { 'User-Agent': 'Mozilla/5.0' }
            });
            const bodyText = cheerio.load(response.data)('body').text();
            return checkTextForStatus(bodyText, DISTRICT_NAME_CLEAN);
        }
    },

    // 5) 610 WTVN
    {
        name: '610 WTVN Radio',
        url: 'https://610wtvn.iheart.com/featured/central-ohio-school-and-business-closings-and-delays/',
        scrape: async (url) => {
            console.log('Scraping: 610 WTVN Closings');
            const response = await axios.get(url, { timeout: TIMEOUT_MS });
            const bodyText = cheerio.load(response.data)('body').text();
            return checkTextForStatus(bodyText, DISTRICT_NAME_CLEAN);
        }
    },

    // 6) Delaware Gazette (local paper)
    {
        name: 'Delaware Gazette',
        url: 'https://www.delgazette.com',
        scrape: async (url) => {
            console.log('Scraping: Delaware Gazette');
            const response = await axios.get(url, { timeout: TIMEOUT_MS });
            const bodyText = cheerio.load(response.data)('body').text();
            return checkTextForStatus(bodyText, DISTRICT_NAME_CLEAN);
        }
    },

    // 7) SchoolClosings.org (Ohio aggregate)
    {
        name: 'SchoolClosings.org Ohio',
        url: 'https://www.schoolclosings.org/ohio/',
        scrape: async (url) => {
            console.log('Scraping: SchoolClosings.org Ohio');
            const response = await axios.get(url, { timeout: TIMEOUT_MS });
            const bodyText = cheerio.load(response.data)('body').text();
            return checkTextForStatus(bodyText, DISTRICT_NAME_CLEAN);
        }
    },

    // 8) Delaware County Sheriff snow/ice emergency levels (heuristic)
    {
        name: 'Delaware County Snow/Ice Emergency Levels',
        url: 'https://sheriff.co.delaware.oh.us/snow-ice-emergency-levels/',
        scrape: async (url) => {
            console.log('Scraping: Delaware County Snow/Ice Emergency Levels');
            const response = await axios.get(url, { timeout: TIMEOUT_MS });
            const text = cheerio.load(response.data)('body').text().toUpperCase();

            // Heuristic:
            // Level 3 => roads closed => treat schools as CLOSED
            // Level 2 => hazardous => often delays => treat as DELAYED
            if (text.includes('LEVEL 3')) return 'CLOSED';
            if (text.includes('LEVEL 2')) return 'DELAYED';

            return 'OPEN';
        }
    }
];

// --- CORE LOGIC: Parallel Execution ---
async function getSchoolStatus() {
    console.log(`Starting parallel scrape of ${SCRAPERS.length} sources...`);

    const checkPromises = SCRAPERS.map(async (scraper) => {
        try {
            const status = await scraper.scrape(scraper.url);
            console.log(`Scraper "${scraper.name}" returned: ${status}`);
            return { name: scraper.name, status };
        } catch (error) {
            console.error(`Scraper "${scraper.name}" error:`, error.message);
            return { name: scraper.name, status: 'ERROR', error: error.message };
        }
    });

    const results = await Promise.all(checkPromises);

    // Priority 1: any explicit CLOSED
    const closedSource = results.find(r => r.status === 'CLOSED');
    if (closedSource) {
        return {
            status: 'CLOSED',
            timestamp: new Date().toISOString(),
            source: closedSource.name,
            results_summary: results
        };
    }

    // Priority 2: any explicit DELAYED
    const delayedSource = results.find(r => r.status === 'DELAYED');
    if (delayedSource) {
        return {
            status: 'DELAYED',
            timestamp: new Date().toISOString(),
            source: delayedSource.name,
            results_summary: results
        };
    }

    // Fallback: if at least one source says OPEN, assume OPEN
    const successCount = results.filter(r => r.status === 'OPEN').length;
    if (successCount > 0) {
        return {
            status: 'OPEN',
            timestamp: new Date().toISOString(),
            source: `Consensus of ${successCount} sources`,
            results_summary: results
        };
    }

    // Total failure
    return {
        status: 'UNKNOWN',
        timestamp: new Date().toISOString(),
        error: 'All sources failed',
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
