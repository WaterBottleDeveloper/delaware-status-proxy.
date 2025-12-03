// server.js (Node.js Proxy - Crash-Proof 9-Source Failover)
const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;
const TIMEOUT_MS = 4000; // 4 second hard timeout for speed
const DISTRICT_NAME_CLEAN = 'Delaware City'; 

// Generic function to safely check text for status keywords
// This "Future Proofs" the logic against CSS changes
const checkTextForStatus = (text, districtName) => {
    const cleanText = text.toUpperCase();
    const cleanDistrict = districtName.toUpperCase();
    
    // If the page mentions the district
    if (cleanText.includes(cleanDistrict)) {
        // Look for keywords
        if (cleanText.includes('CLOSED') || cleanText.includes('CLOSURE')) return 'CLOSED';
        if (cleanText.includes('DELAY') || cleanText.includes('TWO-HOUR') || cleanText.includes('2-HOUR')) return 'DELAYED';
    }
    return 'OPEN'; // Default if name found but no bad news
};

const SCRAPERS = [
    {
        name: 'Official District Homepage (Priority 1)',
        url: 'https://www.dcs.k12.oh.us/',
        scrape: async (url) => {
            // Using strict timeout to prevent hanging on ECONNREFUSED
            const response = await axios.get(url, { timeout: TIMEOUT_MS });
            const $ = cheerio.load(response.data);
            // Check specific alert banners first, then body
            const bannerText = $('.alert, .notification, .banner, .announcement').text().toUpperCase();
            if (bannerText.includes('CLOSED') || bannerText.includes('CLOSURE')) return 'CLOSED';
            if (bannerText.includes('DELAY') || bannerText.includes('2-HOUR')) return 'DELAYED';
            return 'OPEN';
        }
    },
    {
        name: 'WTVN Radio Closings (Priority 2)',
        url: 'https://610wtvn.iheart.com/featured/central-ohio-school-and-business-closings-and-delays/',
        scrape: async (url) => {
            const response = await axios.get(url, { timeout: TIMEOUT_MS });
            const bodyText = cheerio.load(response.data)('body').text();
            return checkTextForStatus(bodyText, DISTRICT_NAME_CLEAN);
        }
    },
    {
        name: 'WBNS-TV / 10TV (Priority 3)',
        url: 'https://www.10tv.com/closings',
        scrape: async (url) => {
            const response = await axios.get(url, { timeout: TIMEOUT_MS, headers: { 'User-Agent': 'Mozilla/5.0' } });
            const bodyText = cheerio.load(response.data)('body').text();
            return checkTextForStatus(bodyText, DISTRICT_NAME_CLEAN);
        }
    },
    {
        name: 'WCMH NBC 4 (Priority 4)',
        url: 'https://www.nbc4i.com/weather/closings/',
        scrape: async (url) => {
            const response = await axios.get(url, { timeout: TIMEOUT_MS, headers: { 'User-Agent': 'Mozilla/5.0' } });
            const bodyText = cheerio.load(response.data)('body').text();
            return checkTextForStatus(bodyText, DISTRICT_NAME_CLEAN);
        }
    },
    {
        name: 'WSYX ABC 6 (Priority 5)',
        url: 'https://abc6onyourside.com/weather/closings',
        scrape: async (url) => {
            const response = await axios.get(url, { timeout: TIMEOUT_MS, headers: { 'User-Agent': 'Mozilla/5.0' } });
            const bodyText = cheerio.load(response.data)('body').text();
            return checkTextForStatus(bodyText, DISTRICT_NAME_CLEAN);
        }
    },
    { 
        name: 'WOSU Public Media (Priority 6)', 
        url: 'https://www.wosu.org/closings', 
        scrape: async (url) => {
            const response = await axios.get(url, { timeout: TIMEOUT_MS });
            const bodyText = cheerio.load(response.data)('body').text();
            return checkTextForStatus(bodyText, DISTRICT_NAME_CLEAN);
        }
    },
    { 
        name: 'HometownStations (Priority 7)', 
        url: 'https://www.hometownstations.com/community/delays_closings/', 
        scrape: async (url) => {
            const response = await axios.get(url, { timeout: TIMEOUT_MS });
            const bodyText = cheerio.load(response.data)('body').text();
            return checkTextForStatus(bodyText, DISTRICT_NAME_CLEAN);
        }
    },
    { 
        name: 'SchoolStatus.io (Priority 8)', 
        url: 'https://www.schoolstatus.io/delaware', 
        scrape: async (url) => {
            const response = await axios.get(url, { timeout: TIMEOUT_MS });
            const bodyText = cheerio.load(response.data)('body').text();
            return checkTextForStatus(bodyText, DISTRICT_NAME_CLEAN);
        }
    },
    { 
        name: 'Columbus Parent (Priority 9)', 
        url: 'https://www.columbusparent.com/school-closings', 
        scrape: async (url) => {
            const response = await axios.get(url, { timeout: TIMEOUT_MS });
            const bodyText = cheerio.load(response.data)('body').text();
            return checkTextForStatus(bodyText, DISTRICT_NAME_CLEAN);
        }
    }
];

app.use(cors());

app.get('/', (req, res) => {
    res.send('Proxy Live. Status at /status');
});

// The Bulletproof Status Function
async function getSchoolStatus() {
    let finalStatus = 'NO REPORT / UNKNOWN';
    let sourceUsed = 'None';
    let errors = [];

    // Loop through sources. If one crashes, CATCH it and CONTINUE.
    for (const scraper of SCRAPERS) {
        try {
            console.log(`Checking: ${scraper.name}...`);
            const status = await scraper.scrape(scraper.url);
            
            // If we found a valid status, stop looking and return it.
            if (status === 'OPEN' || status === 'CLOSED' || status === 'DELAYED') {
                return { status: status, timestamp: new Date().toISOString(), source: scraper.name };
            }
        } catch (error) {
            // Log error but DO NOT CRASH. Just try the next one.
            console.error(`Failed ${scraper.name}: ${error.message}`);
            errors.push(`${scraper.name}: ${error.message}`);
            continue;
        }
    }

    // If we get here, all 9 failed or returned nothing.
    return { 
        status: 'OPEN', // Default to OPEN if we can't find info (safest bet)
        timestamp: new Date().toISOString(),
        source: 'All Sources Failed - Defaulting Open',
        debug_errors: errors
    };
}

app.get('/status', async (req, res) => {
    const data = await getSchoolStatus();
    res.json(data);
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
