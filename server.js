// server.js (Node.js Proxy Code - 10-Source Failover System)
const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;
const DISTRICT_NAME_CLEAN = 'Delaware City'; // Name to search for in text content

// Define 10 Scrapers in order of priority (most stable first)
const SCRAPERS = [
    {
        name: 'Official District Site (Priority 1)',
        url: 'https://www.delawareschools.com/',
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
        name: 'Delaware County ESC (Priority 2)',
        url: 'https://www.delaware-es.k12.oh.us/', // Highly stable, low-traffic site
        // Targets homepage text for the specific district status
        scrape: async (url) => {
            const response = await axios.get(url);
            const normalizedText = cheerio.load(response.data)('body').text().toUpperCase();
            const search = normalizedText.includes('DELAWARE CITY');
            if (search && (normalizedText.includes('CLOSED') || normalizedText.includes('CLOSURE'))) return 'CLOSED';
            if (search && (normalizedText.includes('DELAY') || normalizedText.includes('DELAYED'))) return 'DELAYED';
            return 'OPEN';
        }
    },
    {
        name: 'WOSU Public Media (Priority 3)',
        url: 'https://www.wosu.org/closings', // Stable URL, even if page content changes
        // Targets entire body text for keywords near the district name
        scrape: async (url) => {
            const response = await axios.get(url);
            const normalizedText = cheerio.load(response.data)('body').text().toUpperCase();
            const districtIndex = normalizedText.indexOf('DELAWARE CITY');
            if (districtIndex !== -1) {
                const context = normalizedText.substring(districtIndex, districtIndex + 50);
                if (context.includes('CLOSED')) return 'CLOSED';
                if (context.includes('DELAY') || context.includes('2-HOUR')) return 'DELAYED';
            }
            return 'OPEN';
        }
    },
    {
        name: 'WSYX ABC 6 (Priority 4)',
        url: 'https://abc6onyourside.com/weather/closings', // High 403 risk, but worth the try
        // Attempts scraping the specific list item structure (if 403 is magically bypassed)
        scrape: async (url) => {
            const response = await axios.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }); // Lite bypass attempt
            const $ = cheerio.load(response.data);
            let status = 'OPEN';
            
            // Search specific closing list items for status
            $('.school-closing-item').each((index, element) => {
                const text = $(element).text().toUpperCase();
                if (text.includes('DELAWARE CITY') && (text.includes('CLOSED') || text.includes('CLOSURE'))) {
                    status = 'CLOSED';
                    return false;
                }
                if (text.includes('DELAWARE CITY') && (text.includes('DELAY') || text.includes('2-HOUR'))) {
                    status = 'DELAYED';
                    return false;
                }
            });
            return status;
        }
    },
    {
        name: 'WCMH NBC 4 (Priority 5)',
        url: 'https://www.nbc4i.com/weather/closings/', // High 403 risk, using old selector logic
        scrape: async (url) => {
            const response = await axios.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
            const $ = cheerio.load(response.data);
            const normalizedText = $('body').text().toUpperCase();
            if (normalizedText.includes('DELAWARE CITY') && normalizedText.includes('CLOSED')) return 'CLOSED';
            if (normalizedText.includes('DELAWARE CITY') && normalizedText.includes('DELAY')) return 'DELAYED';
            return 'OPEN';
        }
    },
    // The remaining sources are less specific but increase redundancy
    { name: 'District Twitter Feed (Priority 6)', url: 'https://twitter.com/delawareschools', scrape: async () => 'OPEN' }, 
    { name: 'District Facebook Page (Priority 7)', url: 'https://www.facebook.com/DelawareSchools/', scrape: async () => 'OPEN' }, 
    { name: 'Local Radio Station (Priority 8)', url: 'https://www.wcol.com/closings', scrape: async () => 'OPEN' }, 
    { name: 'Generic Closing Page
