// server.js (Node.js Proxy Code)
const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;
const NEWS_URL = 'https://www.nbc4i.com/weather/closings/'; 
const DISTRICT_NAME = 'Delaware City'; 

app.use(cors());

// Handles requests to the base URL
app.get('/', (req, res) => {
    res.send('Delaware City School District Status Proxy is running. Access status via /status endpoint.');
});

async function getSchoolStatus() {
    try {
        // *** CRITICAL: User-Agent header added to bypass 403 Forbidden error ***
        const response = await axios.get(NEWS_URL, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36'
            }
        });
        
        const $ = cheerio.load(response.data);
        const closingList = $('#closings-list'); // Confirmed selector
        let status = 'OPEN'; 

        closingList.find('.closing').each((index, element) => {
            const text = $(element).text().trim();
            
            if (text.includes(DISTRICT_NAME)) {
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
            error: `Failed to fetch or parse source data. Error: ${error.message}`
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
