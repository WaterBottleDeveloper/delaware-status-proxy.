// server.js (Node.js Proxy - Parallel "Safety First" System)
const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;
const TIMEOUT_MS = 5000; // 5 seconds to let all sites load
const DISTRICT_NAME_CLEAN = 'Delaware City';

// Simple in-memory cache to avoid re-scraping constantly
const CACHE_TTL_MS = 60_000; // 60 seconds
let lastResult = null;
let lastResultTime = 0;

app.use(cors());

// --- HELPER: Generic Text Scanner ---
const checkTextForStatus = (text, districtName) => {
    const cleanText = text.toUpperCase();
    const cleanDistrict = districtName.toUpperCase();

    // Check for keywords globally or near district name
    if (cleanText.includes(cleanDistrict)) {
        if (cleanText.includes('CLOSED') || cleanText.includes('CLOSURE')) return 'CLOSED';
        if (
            cleanText.includes('DELAY') ||
            cleanText.includes('TWO-HOUR') ||
            cleanText.includes('2-HOUR')
        ) return 'DELAYED';
    }
    return 'OPEN';
};

// --- SOURCES ---
const SCRAPERS = [
    {
        name: 'Official District Homepage',
        url: 'https://www.dcs.k12.oh.us/',
        scrape: async (url) => {
            console.log('Scraping: Official District Homepage');
            const response = await axios.get(url, { timeout: TIMEOUT_MS });
            const $ = cheerio.load(response.data);
            const bannerText = $('.alert, .notification, .banner, .announcement')
                .text()
                .toUpperCase();

            if (bannerText.includes('CLOSED') || bannerText.includes('CLOSURE')) return 'CLOSED';
            if (bannerText.includes('DELAY') || bannerText.includes('2-HOUR')) return 'DELAYED';
            return 'OPEN';
        }
    },
    {
        name: 'WTVN Radio Closings',
        url: 'https://610wtvn.iheart.com/featured/central-ohio-school-and-business-closings-and-delays/',
        scrape: async (url) => {
            console.log('Scraping: WTVN Radio Closings');
            const response = await axios.get(url, { timeout: TIMEOUT_MS });
            const bodyText = cheerio.load(response.data)('body').text();
            return checkTextForStatus(bodyText, DISTRICT_NAME_CLEAN);
        }
    },
    {
        name: 'WBNS-TV / 10TV',
        url: 'https://www.10tv.com/closings',
        scrape: async (url) => {
            console.log('Scraping: WBNS-TV / 10TV');
            const response = await axios.get(url, {
                timeout: TIMEOUT_MS,
                headers: { 'User-Agent': 'Mozilla/5.0' }
            });
            const bodyText = cheerio.load(response.data)('body').text();
            return checkTextForStatus(bodyText, DISTRICT_NAME_CLEAN);
        }
    },
    {
        name: 'WCMH NBC 4',
        url: 'https://www.nbc4i.com/weather/closings/',
        scrape: async (url) => {
            console.log('Scraping: WCMH NBC 4');
            const response = await axios.get(url, {
                timeout: TIMEOUT_MS,
                headers: { 'User-Agent': 'Mozilla/5.0' }
            });
            const bodyText = cheerio.load(response.data)('body').text();
            return checkTextForStatus(bodyText, DISTRICT_NAME_CLEAN);
        }
    },
    {
        name: 'WSYX ABC 6',
        url: 'https://abc6onyourside.com/weather/closings',
        scrape: async (url) => {
            console.log('Scraping: WSYX ABC 6');
            const response = await axios.get(url, {
                timeout: TIMEOUT_MS,
                headers: { 'User-Agent': 'Mozilla/5.0' }
            });
            const bodyText = cheerio.load(response.data)('body').text();
            return checkTextForStatus(bodyText, DISTRICT_NAME_CLEAN);
        }
    },
    {
        name: 'WOSU Public Media',
        url: 'https://www.wosu.org/closings',
        scrape: async (url) => {
            console.log('Scraping: WOSU Public Media');
            const response = await axios.get(url, { timeout: TIMEOUT_MS });
            const bodyText = cheerio.load(response.data)('body').text();
            return checkTextForStatus(bodyText, DISTRICT_NAME_CLEAN);
        }
    },
    {
        name: 'HometownStations',
        url: 'https://www.hometownstations.com/community/delays_closings/',
        scrape: async (url) => {
            console.log('Scraping: HometownStations');
            const response = await axios.get(url, { timeout: TIMEOUT_MS });
            const bodyText = cheerio.load(response.data)('body').text();
            return checkTextForStatus(bodyText, DISTRICT_NAME_CLEAN);
        }
    },
    {
        name: 'SchoolStatus.io',
        url: 'https://www.schoolstatus.io/delaware',
        scrape: async (url) => {
            console.log('Scraping: SchoolStatus.io');
            const response = await axios.get(url, { timeout: TIMEOUT_MS });
            const bodyText = cheerio.load(response.data)('body').text();
            return checkTextForStatus(bodyText, DISTRICT_NAME_CLEAN);
        }
    },
    {
        name: 'Columbus Parent',
        url: 'https://www.columbusparent.com/school-closings',
        scrape: async (url) => {
            console.log('Scraping: Columbus Parent');
            const response = await axios.get(url, { timeout: TIMEOUT_MS });
            const bodyText = cheerio.load(response.data)('body').text();
            return checkTextForStatus(bodyText, DISTRICT_NAME_CLEAN);
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

    const closedSource = results.find(r => r.status === 'CLOSED');
    if (closedSource) {
        return {
            status: 'CLOSED',
            timestamp: new Date().toISOString(),
            source: closedSource.name,
            results_summary: results
        };
    }

    const delayedSource = results.find(r => r.status === 'DELAYED');
    if (delayedSource) {
        return {
            status: 'DELAYED',
            timestamp: new Date().toISOString(),
            source: delayedSource.name,
            results_summary: results
        };
    }

    const successCount = results.filter(r => r.status === 'OPEN').length;
    if (successCount > 0) {
        return {
            status: 'OPEN',
            timestamp: new Date().toISOString(),
            source: `Consensus of ${successCount} sources`,
            results_summary: results
        };
    }

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
