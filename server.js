// server.js (Node.js Proxy Code)
const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;
// URL of the reliable news closing page
const NEWS_URL = 'https://www.nbc4i.com/weather/closings/'; 
// The name of the district as it appears on the news page
const DISTRICT_NAME = 'Delaware City'; 

// Enable CORS for all origins to allow your GitHub Pages site to fetch data
app.use(cors());

/**
 * Fetches the HTML from the news site and parses the school closing status.
 * @returns {object} An object containing the status and timestamp.
 */
async function getSchoolStatus() {
    try {
        const response = await axios.get(NEWS_URL);
        const $ = cheerio.load(response.data);

        // CRITICAL: This selector must match the current HTML structure of the news site
        const closingList = $('.js-school-status-list'); 
        let status = 'OPEN'; // Default to OPEN

        // Iterate through all listed closings to find the target district
        closingList.find('li').each((index, element) => {
            const text = $(element).text().trim();
            
            if (text.includes(DISTRICT_NAME)) {
                // Check for keywords to determine status
                if (text.includes('Closed') || text.includes('Closing')) {
                    status = 'CLOSED';
                    return false; // Found closure, stop searching
                } else if (text.includes('Delay') || text.includes('Delayed')) {
                    status = 'DELAYED';
                    return false; // Found delay, stop searching
                }
            }
        });
        
        // Return the clean JSON status
        return { 
            status: status, 
            timestamp: new Date().toISOString() 
        };

    } catch (error) {
        console.error('Scraping Error:', error.message);
        // Return error status if network or parsing fails
        return { 
            status: 'NO REPORT / UNKNOWN', 
            timestamp: new Date().toISOString(),
            error: 'Failed to fetch or parse source data.'
        };
    }
}

// API Endpoint: When your front end hits /status, this function runs
app.get('/status', async (req, res) => {
    const statusData = await getSchoolStatus();
    res.json(statusData);
});

// Start the Express server and listen on the assigned PORT
app.listen(PORT, () => {
    console.log(`Proxy server listening on port ${PORT}`);
});
