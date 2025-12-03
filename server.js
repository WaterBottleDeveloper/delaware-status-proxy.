// server.js (Node.js Proxy Code - FINAL SOURCE: WOSU Public Media)
const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;
// *** FINAL SOURCE URL: WOSU Public Media (low anti-bot risk) ***
const NEWS_URL = 'https://radio.wosu.org/public-safety/closings'; 
// The name of the district as it appears on the WOSU site
const DISTRICT_NAME = 'Delaware City'; 

app.use(cors());

app.get('/', (req, res) => {
    res.send('Delaware City School District Status Proxy is running. Access status via /status endpoint.');
});

async function getSchoolStatus() {
    try {
        // Simple fetch is used as public media sites rarely block User-Agents
        const response = await axios.get(NEWS_URL); 
        
        const $ = cheerio.load(response.data);

        // Target the main article content on the WOSU page
        const closingText = $('article.content').text(); 
        let status = 'OPEN'; 
        
        // Convert all content to uppercase for reliable keyword matching
        const normalizedText = closingText.toUpperCase();
        const normalizedDistrict = DISTRICT_NAME.toUpperCase();

        if (normalizedText.includes(normalizedDistrict)) {
            // Check the text immediately following the district name for status keywords
            const districtIndex = normalizedText.indexOf(normalizedDistrict);
            const context = normalizedText.substring(districtIndex, districtIndex + 50);

            if (context.includes('CLOSED')) {
                status = 'CLOSED';
            } else if (context.includes('DELAY') || context.includes('2-HOUR')) {
                status = 'DELAYED';
            }
        }
        
        return { 
            status: status, 
            timestamp: new Date().toISOString() 
        };

    } catch (error) {
        console.error('Scraping Error:', error.message);
        return { 
            status: 'NO REPORT / UNKNOWN', 
            timestamp: new Date().toISOString(),
            error: `Critical failure reaching source. Error: ${error.message}`
        };
    }
}

app.get('/status', async (req, res) => {
    const statusData = await getSchoolStatus();
    res.json(statusData);
});

app.listen(PORT, () => {
    console.log(`Proxy server listening on port ${PORT}`);
});
