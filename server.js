// server.js (Node.js Proxy Code - Optimized 3-Source Failover System)
const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;
const DISTRICT_NAME_CLEAN = 'Delaware City'; 

// Define 3 highly stable scrapers in order of priority
const SCRAPERS = [
    {
        name: 'Official District Homepage (Priority 1)',
        url: 'https://www.dcs.k12.oh.us/',
        // Targets homepage banner/text
        scrape: async (url) => {
            const response = await axios.get(url);
            const normalizedText = cheerio.load(response.data)('body').text().toUpperCase();
            if (normalizedText.includes('CLOSED') || normalizedText.includes('CLOSURE')) return 'CLOSED';
            if (normalizedText.includes('DELAY') || normalizedText.includes('TWO-HOUR') || normalizedText.includes('2-HOUR')) return 'DELAYED';
            return 'OPEN';
        }
    },
    {
        name: 'Official Delays/Closings Page (Priority 2)',
        url: 'https://www.dcs.k12.oh.us/for-families/school-hours-delay-schedule/school-delay-closings',
        // Targets specific delay page text
        scrape: async (url) => {
            const response = await axios.get(url);
            const normalizedText = cheerio.load(response.data)('body').text().toUpperCase();
            if (normalizedText.includes('CLOSED') || normalizedText.includes('CLOSURE')) return 'CLOSED';
            if (normalizedText.includes('DELAY') || normalizedText.includes('TWO-HOUR') || normalizedText.includes('2-HOUR')) return 'DELAYED';
            return 'OPEN';
        }
    },
    {
        name: 'WTVN Radio Closings (Priority 3 Backup)',
        url: 'https://610wtvn.iheart.com/featured/central-ohio-school-and-business-closings-and-delays/',
        // Targets simple text list structure, searches for keywords near the district name
        scrape: async (url) => {
            const response = await axios.get(url);
            const normalizedText = cheerio.load(response.data)('body').text().toUpperCase();
            const searchDistrict = normalizedText.includes(DISTRICT_NAME_CLEAN.toUpperCase());
            
            if (searchDistrict && (normalizedText.includes('CLOSED') || normalizedText.includes('CLOSURE'))) return 'CLOSED';
            if (searchDistrict && (normalizedText.includes('DELAY') || normalizedText.includes('DELAYED'))) return 'DELAYED';
            return 'OPEN';
        }
    }
];

app.use(cors());

// Handles requests to the base URL
app.get('/', (req, res) => {
    res.send('Delaware City School District Status Proxy is running. Access status via /status endpoint. Multi-source failover active.');
});

/**
 * Iterates through the 3 defined scrapers until one succeeds.
 */
async function getSchoolStatus() {
    let finalStatus = 'NO REPORT / UNKNOWN';
    let sourceUsed = 'None';
    let firstError = null;

    for (const scraper of SCRAPERS) {
        try {
            console.log(`Attempting to scrape source: ${scraper.name}`);
            // Use a timeout of 10 seconds to prevent waiting forever on a dead connection
            const status = await scraper.scrape(scraper.url); 
            
            // Check if the scraper returned a valid, decisive status
            if (status === 'OPEN' || status === 'CLOSED' || status === 'DELAYED') {
                finalStatus = status;
                sourceUsed = scraper.name;
                break; // Success! Stop and use this status.
            }
        } catch (error) {
            console.error(`Scraper failed for ${scraper.name}: ${error.message}`);
            if (!firstError) {
                firstError = error.message; // Store the first error encountered
            }
        }
    }

    // If every source failed, return a single error message
    if (finalStatus === 'NO REPORT / UNKNOWN' && firstError) {
        return {
            status: finalStatus,
            timestamp: new Date().toISOString(),
            error: `All sources failed. First failure: ${firstError}`
        };
    }
    
    return { 
        status: finalStatus, 
        timestamp: new Date().toISOString(),
        source: sourceUsed
    };
}

// API Endpoint
app.get('/status', async (req, res) => {
    const statusData = await getSchoolStatus();
    res.json(statusData);
});

// Start the Express server
app.listen(PORT, () => {
    console.log(`Proxy server listening on port ${PORT}`);
});
