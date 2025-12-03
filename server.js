// server.js (Node.js Proxy Code - NEW SOURCE: WSYX ABC 6 / FOX 28)
const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;
// *** NEW SOURCE URL ***
const NEWS_URL = 'https://abc6onyourside.com/weather/closings'; 
// The name of the district as it appears on the WSYX site
const DISTRICT_NAME = 'Delaware City Schools'; 

app.use(cors());

app.get('/', (req, res) => {
    res.send('Delaware City School District Status Proxy is running. Access status via /status endpoint.');
});

async function getSchoolStatus() {
    try {
        // Keeping strong headers to bypass any potential blocks
        const response = await axios.get(NEWS_URL, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36',
                'Referer': NEWS_URL, 
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8'
            }
        });
        
        const $ = cheerio.load(response.data);

        // *** NEW SELECTOR: Targeting the known list structure on the WSYX page ***
        // This selector targets a common structure used by this network.
        const closingList = $('.school-closing-item'); 
        let status = 'OPEN'; 
        let found = false;

        closingList.each((index, element) => {
            const text = $(element).text().trim();
            
            if (text.includes(DISTRICT_NAME)) {
                found = true;
                // The status is often the very next element or inside the same item
                if (text.includes('CLOSED') || text.includes('Closing')) {
                    status = 'CLOSED';
                    return false; 
                } else if (text.includes('DELAY') || text.includes('Delayed') || text.includes('2-Hour')) {
                    status = 'DELAYED';
                    return false; 
                }
            }
        });
        
        // If the district wasn't explicitly listed (it only appears when closed/delayed)
        if (!found) {
             // We return OPEN because if they aren't on the list, they are open.
             return { status: 'OPEN', timestamp: new Date().toISOString() };
        }

        return { 
            status: status, 
            timestamp: new Date().toISOString() 
        };

    } catch (error) {
        console.error('Scraping Error:', error.message);
        // This error now means the WSYX site failed, which is a rare, critical failure
        return { 
            status: 'NO REPORT / UNKNOWN', 
            timestamp: new Date().toISOString(),
            error: `Source failed. Error: ${error.message}`
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
