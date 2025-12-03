// server.js (Node.js Proxy Code - Optimized 3-Source Failover System with Monitoring)
const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;
const DISTRICT_NAME_CLEAN = 'Delaware City'; 

// --- GLOBAL MONITORING STATE ---
let monitoringData = {
    totalSources: 3, 
    lastScrapeTime: 'Server started, no scrape yet.',
    lastStatus: 'INITIALIZING',
    lastSourceUsed: 'N/A',
    attemptsMade: 0,
    successfulAttempts: 0,
    firstFailureMessage: 'N/A'
};

// Define 3 highly stable scrapers in order of priority
const SCRAPERS = [
    {
        name: 'Official District Homepage (Priority 1)',
        url: 'https://www.dcs.k12.oh.us/',
        // Targets specific alert banner CSS class or common keywords in banners
        scrape: async (url) => {
            const response = await axios.get(url, { timeout: 8000 }); 
            const $ = cheerio.load(response.data);
            
            // Check common alert CSS classes
            const alertText = $('.alert, .notification, .banner, .announcement').text().toUpperCase();
            
            if (alertText.includes('CLOSED') || alertText.includes('CLOSURE')) return 'CLOSED';
            if (alertText.includes('DELAY') || alertText.includes('TWO-HOUR') || alertText.includes('2-HOUR')) return 'DELAYED';
            
            return 'OPEN';
        }
    },
    {
        name: 'Official Delays/Closings Page (Priority 2)',
        url: 'https://www.dcs.k12.oh.us/for-families/school-hours-delay-schedule/school-delay-closings',
        // Targets specific delay page text
        scrape: async (url) => {
            const response = await axios.get(url, { timeout: 8000 });
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
            const response = await axios.get(url, { timeout: 8000 });
            const normalizedText = cheerio.load(response.data)('body').text().toUpperCase();
            const searchDistrict = normalizedText.includes(DISTRICT_NAME_CLEAN.toUpperCase());
            
            if (searchDistrict && (normalizedText.includes('CLOSED') || normalizedText.includes('CLOSURE'))) return 'CLOSED';
            if (searchDistrict && (normalizedText.includes('DELAY') || normalizedText.includes('DELAYED'))) return 'DELAYED';
            return 'OPEN';
        }
    }
];

app.use(cors());

// Monitoring Dashboard (The new / route)
app.get('/', (req, res) => {
    res.setHeader('Content-Type', 'text/html');
    res.send(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <title>Proxy Monitoring Dashboard</title>
            <style>
                body { font-family: sans-serif; background-color: #f4f7f6; color: #333; padding: 20px; }
                .container { max-width: 800px; margin: 0 auto; background: #fff; padding: 30px; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); }
                h1 { color: #007bff; border-bottom: 2px solid #007bff; padding-bottom: 10px; margin-bottom: 20px; }
                .status-badge { display: inline-block; padding: 5px 10px; border-radius: 5px; font-weight: bold; }
                .status-ok { background-color: #28a745; color: white; }
                .status-fail { background-color: #dc3545; color: white; }
                pre { white-space: pre-wrap; word-wrap: break-word; }
            </style>
        </head>
        <body>
            <div class="container">
                <h1>Delaware Status Proxy Monitor</h1>
                <p>This page shows the result of the <strong>last status check</strong> triggered by the website or a manual visit to the <code>/status</code> endpoint.</p>

                <h2>Current Status Summary</h2>
                <p><strong>Total Sources Defined:</strong> ${monitoringData.totalSources}</p>
                <p><strong>Scrape Result:</strong> 
                    <span class="status-badge status-${(monitoringData.lastStatus === 'OPEN' || monitoringData.lastStatus === 'CLOSED' || monitoringData.lastStatus === 'DELAYED') ? 'ok' : 'fail'}">
                        ${monitoringData.lastStatus}
                    </span>
                </p>
                <p><strong>Source Used:</strong> ${monitoringData.lastSourceUsed}</p>
                <p><strong>Attempt Progress:</strong> ${monitoringData.attemptsMade}/${monitoringData.totalSources} sources checked (${monitoringData.successfulAttempts > 0 ? 'SUCCESS' : 'FAILURE'})</p>

                <h2>Last Scrape Details</h2>
                <pre>${JSON.stringify(monitoringData, null, 2)}</pre>

                <h2>Source List (Priority Order)</h2>
                <pre>${SCRAPERS.map(s => `[P${SCRAPERS.indexOf(s) + 1}] ${s.name}: ${s.url}`).join('\n')}</pre>
            </div>
        </body>
        </html>
    `);
});


/**
 * Iterates through the 3 defined scrapers until one succeeds.
 */
async function getSchoolStatus() {
    let finalStatus = 'NO REPORT / UNKNOWN';
    let sourceUsed = 'None';
    let firstError = null;
    let attempts = 0;
    let successfulAttempts = 0;

    for (const scraper of SCRAPERS) {
        attempts++;
        try {
            console.log(`Attempting to scrape source: ${scraper.name}`);
            const status = await scraper.scrape(scraper.url);
            
            // Check if the scraper returned a valid, decisive status
            if (status === 'OPEN' || status === 'CLOSED' || status === 'DELAYED') {
                finalStatus = status;
                sourceUsed = scraper.name;
                successfulAttempts = attempts; // Record how many attempts it took (1, 2, or 3)
                break; // Success! Stop and use this status.
            }
        } catch (error) {
            // Log the specific scraping failure
            const errMsg = error.code || error.message;
            console.error(`Scraper failed for ${scraper.name}: ${errMsg}`);
            if (!firstError) {
                firstError = errMsg; // Store the first error encountered
            }
        }
    }

    // --- UPDATE MONITORING STATE ---
    monitoringData.lastScrapeTime = new Date().toISOString();
    monitoringData.lastStatus = finalStatus;
    monitoringData.lastSourceUsed = sourceUsed;
    monitoringData.attemptsMade = attempts;
    monitoringData.successfulAttempts = successfulAttempts > 0 ? successfulAttempts : 0;
    monitoringData.firstFailureMessage = firstError || 'N/A';
    // -------------------------------

    // If every source failed, return a single error message
    if (finalStatus === 'NO REPORT / UNKNOWN' && firstError) {
        return {
            status: finalStatus,
            timestamp: monitoringData.lastScrapeTime,
            error: `All sources failed. First failure: ${firstError}`
        };
    }
    
    return { 
        status: finalStatus, 
        timestamp: monitoringData.lastScrapeTime,
        source: sourceUsed
    };
}

// API Endpoint for the website to fetch status (triggers the scrape)
app.get('/status', async (req, res) => {
    const statusData = await getSchoolStatus();
    res.json(statusData);
});


// Start the Express server
app.listen(PORT, () => {
    console.log(`Proxy server listening on port ${PORT}`);
});
