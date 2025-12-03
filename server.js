// server.js (Node.js Proxy Code)
const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;
const NEWS_URL = 'https://www.nbc4i.com/weather/closings/'; 
const DISTRICT_NAME = 'Delaware City'; 

// Enable CORS so the GitHub Pages site can access this server
app.use(cors());

async function getSchoolStatus() {
    try {
        const response = await axios.get(NEWS_URL);
        const $ = cheerio.load(response.data);
        const closingList = $('.js-school-status-list'); 
        let status = 'OPEN'; 

        // Look through the list of closings to find Delaware City
        closingList.find('li').each((index, element) => {
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
        
        // Return the status as clean JSON
        return { 
            status: status, 
            timestamp: new Date().toISOString() 
        };

    } catch (error) {
        // Return error status if scraping fails
        return { 
            status: 'NO REPORT / UNKNOWN', 
            timestamp: new Date().toISOString(),
            error: 'Failed to fetch or parse source data.'
        };
    }
}

// API Endpoint that the GitHub Pages site calls
app.get('/status', async (req, res) => {
    const statusData = await getSchoolStatus();
    res.json(statusData);
});

app.listen(PORT, () => {
    console.log(`Proxy server listening on port ${PORT}`);
});
