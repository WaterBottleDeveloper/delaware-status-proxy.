// server.js (Node.js Proxy Code - FINAL SOURCE: WOSU Public Media)
const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;
// *** FINAL FIXED SOURCE URL: WOSU Public Media (Solves 404 Error) ***
const NEWS_URL = 'https://www.wosu.org/closings'; 
// The name of the district as it appears on the WOSU site
const DISTRICT_NAME = 'Delaware City'; 

app.use(cors());

// Handles requests to the base URL (Optional, but solves "Cannot GET /" error)
app.get('/', (req, res) => {
    res.send('Delaware City School District Status Proxy is running. Access status via /status endpoint.');
});

/**
 * Fetches the HTML from the WOSU site and parses the school closing status.
 * @returns {object} An object containing the status and timestamp.
 */
async function getSchoolStatus() {
    try {
        // Simple fetch is used as public media sites rarely block bots
        const response = await axios.get(NEWS_URL); 
        
        const $ = cheerio.load(response.data);

        // Target the main article content on the WOSU page
        const closingText = $('article.content').text(); 
        let status = 'OPEN'; // Default status
        
        // Convert all content to uppercase for reliable keyword matching
        const normalizedText = closingText.toUpperCase();
        const normalizedDistrict = DISTRICT_NAME.toUpperCase();

        if (normalizedText.includes(normalizedDistrict)) {
            // Find the index of the district name
            const districtIndex = normalizedText.indexOf(normalizedDistrict);
            
            // Look at the text immediately following the district name (e.g., within 50 characters)
            const context = normalizedText.substring(districtIndex, districtIndex + 50);

            if (context.includes('CLOSED')) {
                status = 'CLOSED';
            } else if (context.includes('DELAY') || context.includes('2-HOUR')) {
                status = 'DELAYED';
            }
        }
        
        // Return the clean JSON status
        return { 
            status: status, 
            timestamp: new Date().toISOString() 
        };

    } catch (error) {
        console.error('Scraping Error:', error.message);
        // Returns an informative error message if the URL is wrong again or server fails
        return { 
            status: 'NO REPORT / UNKNOWN', 
            timestamp: new Date().toISOString(),
            error: `Source access failed. Check NEWS_URL. Error: ${error.message}`
        };
    }
}

// API Endpoint: When your front end hits /status, this function runs
app.get('/status', async (
