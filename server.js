// server.js (Node.js Proxy Code)
const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;
const NEWS_URL = 'https://www.nbc4i.com/weather/closings/'; 
const DISTRICT_NAME = 'Delaware City'; // Name to search for

app.use(cors());

async function getSchoolStatus() {
    try {
        const response = await axios.get(NEWS_URL);
        const $ = cheerio.load(response.data);

        // *** FIXED SELECTOR: Targeting the ID 'closings-list' ***
        const closingList = $('#closings-list'); 
        let status = 'OPEN'; 

        // Search through each child element with class 'closing' inside the list
        closingList.find('.closing').each((index, element) => {
            const text = $(element).text().trim();
            
            if (text.includes(DISTRICT_NAME)) {
                // Check for keywords to determine status
                if (text.includes('Closed') || text.includes('Closing')) {
                    status = 'CLOSED';
                    return false; 
                } else if (text.includes('Delay') || text.includes('Delayed')) {
                    status = 'DELAYED';
                    return false; 
                }
            }
        });
        
        return { 
            status: status, 
            timestamp: new Date().toISOString() 
        };

    } catch (error) {
        console.error('Scraping Error:', error.message);
        return { 
            status: 'NO REPORT / UNKNOWN', 
            timestamp: new Date().toISOString(),
            error: 'Failed to fetch or parse source data.'
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
