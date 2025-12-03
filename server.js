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

// Add a simple root route handler (Optional, but fixes "Cannot GET /" error)
app.get('/', (req, res) => {
    res.send('Delaware City School District Status Proxy is running. Access status via /status endpoint.');
});

/**
 * Fetches the HTML from the news site and parses the school closing status.
 * @returns {object} An object containing the status and timestamp.
 */
async function getSchoolStatus() {
    try {
        const response = await axios.get(NEWS_URL);
        const $ = cheerio.load(response.data);

        // *** FIXED SELECTOR: Targeting the ID 'closings-list' from your inspection ***
        const closingList = $('#closings-list'); 
        let status = 'OPEN'; // Default to OPEN

        // Search through each child element with class 'closing' inside the list
        closingList.find('.closing').each((index, element) => {
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
