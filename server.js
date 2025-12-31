const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const apicache = require('apicache');
const rateLimit = require('express-rate-limit');

const app = express();
const cache = apicache.middleware;

app.set('trust proxy', 1);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const target = process.env.DATA || 'https://data-api.alwaysdata.net'; // Jika belum disetting, akan ke Google sebagai test
const deviceHeaderKey = process.env.SG || 'x-device';
const fakeUserAgent = process.env.KEY || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';
const frontendUrl = process.env.FRONTEND_URL || '*';

app.get('/ping', (req, res) => res.status(200).send('OK'));

// REMOVED: botFilter (Sekarang semua orang bisa akses tanpa Header SG)

const burstLimiter = rateLimit({
    windowMs: 1 * 1000, 
    limit: 10, 
    keyGenerator: (req, res) => req.ip,
    handler: (req, res) => res.status(429).json({ statusCode: false, message: "Too Many Requests" })
});

const standardLimiter = rateLimit({
    windowMs: 1 * 60 * 1000,
    limit: 300,
    keyGenerator: (req, res) => req.ip,
    handler: (req, res) => res.status(429).json({ statusCode: false, message: "Too Many Requests" })
});

app.use(burstLimiter);
app.use(standardLimiter);

const cacheRule = (req, res) => req.method === 'GET' && res.statusCode === 200;
app.use(cache('5 minutes', cacheRule));

app.use('/', createProxyMiddleware({
    target: target,
    changeOrigin: true, 
    secure: true,
    xfwd: true, 
    logLevel: 'silent', 
    
    onProxyReq: (proxyReq, req, res) => {
        proxyReq.setHeader('User-Agent', fakeUserAgent);
        proxyReq.setHeader('Referer', target + '/');
        proxyReq.removeHeader('x-forwarded-for');
        proxyReq.removeHeader('via');
        proxyReq.removeHeader('cookie'); 
    },

    onProxyRes: (proxyRes, req, res) => {
        delete proxyRes.headers['x-frame-options'];
        delete proxyRes.headers['content-security-policy'];
        delete proxyRes.headers['set-cookie'];
        
        proxyRes.headers['Access-Control-Allow-Origin'] = frontendUrl;
        proxyRes.headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS';
        proxyRes.headers['Access-Control-Allow-Headers'] = 'Content-Type, ' + deviceHeaderKey;
    }
}));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server Jembatan berjalan di port ${PORT}`);
});
