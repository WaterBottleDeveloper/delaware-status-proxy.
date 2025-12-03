// server.js (Node.js Proxy - Parallel "Safety First" System)
const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;
const TIMEOUT_MS = 5000; // 5 seconds to let all sites load
const DISTRICT_NAME_CLEAN = 'Delaware City'; 

app.use(cors());

// --- HELPER: Generic Text Scanner ---
const checkTextForStatus = (text, districtName) => {
    const cleanText = text.toUpperCase();
    const cleanDistrict = districtName.toUpperCase();
    
    // Check for keywords globally or near district name
    if (cleanText.includes(cleanDistrict)) {
        if (cleanText.includes('CLOSED') || cleanText.includes('CLOSURE')) return 'CLOSED';
        if (cleanText.includes('DELAY') || cleanText.includes('TWO-HOUR') || cleanText.includes('2-HOUR')) return 'DELAYED';
    }
    return 'OPEN';
};

// --- SOURCES ---
const SCRAPERS = [
    {
        name: 'Official District Homepage',
        url: 'https://www.dcs.k12.oh.us/',
        scrape: async (url) => {
            const response = await axios.get(url, { timeout: TIMEOUT_MS });
            const $ = cheerio.load(response.data);
            const bannerText = $('.alert, .notification, .banner, .announcement').text().toUpperCase();
            if (bannerText.includes('CLOSED') || bannerText.includes('CLOSURE')) return 'CLOSED';
            if (bannerText.includes('DELAY') || bannerText.includes('2-HOUR')) return 'DELAYED';
            return 'OPEN';
        }
    },
    {
        name: 'WTVN Radio Closings',
        url: 'https://610wtvn.iheart.com/featured/central-ohio-school-and-business-closings-and-delays/',
        scrape: async (url) => {
            const response = await axios.get(url, { timeout: TIMEOUT_MS });
            return checkTextForStatus(cheerio.load(response.data)('body').text(), DISTRICT_NAME_CLEAN);
        }
    },
    {
        name: 'WBNS-TV / 10TV',
        url: 'https://www.10tv.com/closings',
        scrape: async (url) => {
            const response = await axios.get(url, { timeout: TIMEOUT_MS, headers: { 'User-Agent': 'Mozilla/5.0' } });
            return checkTextForStatus(cheerio.load(response.data)('body').text(), DISTRICT_NAME_CLEAN);
        }
    },
    {
        name: 'WCMH NBC 4',
        url: 'https://www.nbc4i.com/weather/closings/',
        scrape: async (url) => {
            const response = await axios.get(url, { timeout: TIMEOUT_MS, headers: { 'User-Agent': 'Mozilla/5.0' } });
            return checkTextForStatus(cheerio.load(response.data)('body').text(), DISTRICT_NAME_CLEAN);
        }
    },
    {
        name: 'WSYX ABC 6',
        url: 'https://abc6onyourside.com/weather/closings',
        scrape: async (url) => {
            const response = await axios.get(url, { timeout: TIMEOUT_MS, headers: { 'User-Agent': 'Mozilla/5.0' } });
            return checkTextForStatus(cheerio.load(response.data)('body').text(), DISTRICT_NAME_CLEAN);
        }
    },
    { 
        name: 'WOSU Public Media', 
        url: 'https://www.wosu.org/closings', 
        scrape: async (url) => {
            const response = await axios.get(url, { timeout: TIMEOUT_MS });
            return checkTextForStatus(cheerio.load(response.data)('body').text(), DISTRICT_NAME_CLEAN);
        }
    },
    { 
        name: 'HometownStations', 
        url: 'https://www.hometownstations.com/community/delays_closings/', 
        scrape: async (url) => {
            const response = await axios.get(url, { timeout: TIMEOUT_MS });
            return checkTextForStatus(cheerio.load(response.data)('body').text(), DISTRICT_NAME_CLEAN);
        }
    },
    { 
        name: 'SchoolStatus.io', 
        url: 'https://www.schoolstatus.io/delaware', 
        scrape: async (url) => {
            const response = await axios.get(url, { timeout: TIMEOUT_MS });
            return checkTextForStatus(cheerio.load(response.data)('body').text(), DISTRICT_NAME_CLEAN);
        }
    },
    { 
        name: 'Columbus Parent', 
        url: 'https://www.columbusparent.com/school-closings', 
        scrape: async (url) => {
            const response = await axios.get(url, { timeout: TIMEOUT_MS });
            return checkTextForStatus(cheerio.load(response.data)('body').text(), DISTRICT_NAME_CLEAN);
        }
    }
];

// --- CORE LOGIC: Parallel Execution ---
async function getSchoolStatus() {
    console.log(`Starting parallel scrape of ${SCRAPERS.length} sources...`);
    
    // 1. Fire ALL requests simultaneously
    const checkPromises = SCRAPERS.map(async (scraper) => {
        try {
            const status = await scraper.scrape(scraper.url);
            return { name: scraper.name, status: status };
        } catch (error) {
            return { name: scraper.name, status: 'ERROR', error: error.message };
        }
    });

    // 2. Wait for all to finish (or timeout)
    const results = await Promise.all(checkPromises);
    
    // 3. PRIORITY LOGIC: Bad news overrides good news
    const closedSource = results.find(r => r.status === 'CLOSED');
    if (closedSource) {
        return { status: 'CLOSED', timestamp: new Date().toISOString(), source: closedSource.name, results_summary: results };
    }

    const delayedSource = results.find(r => r.status === 'DELAYED');
    if (delayedSource) {
        return { status: 'DELAYED', timestamp: new Date().toISOString(), source: delayedSource.name, results_summary: results };
    }

    // 4. Fallback to OPEN if at least one source worked
    const successCount = results.filter(r => r.status === 'OPEN').length;
    if (successCount > 0) {
        return { status: 'OPEN', timestamp: new Date().toISOString(), source: `Consensus of ${successCount} sources`, results_summary: results };
    }

    // 5. Total Failure
    return { status: 'UNKNOWN', timestamp: new Date().toISOString(), error: 'All sources failed' };
}

app.get('/', (req, res) => res.send('Parallel Proxy Running. Hit /status to check.'));

app.get('/status', async (req, res) => {
    const data = await getSchoolStatus();
    res.json(data);
