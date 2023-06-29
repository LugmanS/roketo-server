import express from "express";
import http from "http";
import { Server } from "socket.io";
import { createClient } from "redis";
import dotenv from "dotenv";
import cors from "cors";
import { sampleEndpointKey, sampleEndpointValue } from "./utils";

dotenv.config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "https://www.roketo.cloud"
    }
});
const PORT = process.env.PORT || 8000;

app.use(cors());
app.use(express.urlencoded());
app.use(express.text());
app.use(express.json());

const redisClient = createClient({
    url: process.env.REDIS_DB_URL
});

(async () => {
    redisClient.on('error', (error) => console.log('RedisClientError:', error));
    await redisClient.connect();
})();

//Common functions
const generateEndpointKey = (collectionId: String, method: string, path: String) => `${collectionId}-${method}-${path}`;

//Middleware route
app.use(async (req, res, next) => {
    console.log(req.method, req.subdomains, req.url, req.headers);
    if (req.subdomains[0] === 'api') {
        return next();
    }
    const endpointKey = generateEndpointKey(req.subdomains[0], req.method, req.path);
    io.sockets.in(req.subdomains[0]).emit('new-request', {
        path: req.url,
        url: req.protocol + '://' + req.get('host') + req.originalUrl,
        headers: req.headers,
        body: req.body,
        method: req.method,
        cookies: req.cookies,
        query: req.query,
    });
    try {
        const rawEndpointData = await redisClient.get(endpointKey);
        if (!rawEndpointData) {
            return res.sendStatus(404);
        }
        const endpointData = JSON.parse(rawEndpointData);
        res.set(endpointData.headers);
        res.status(endpointData.statusCode).send(endpointData.body);
    } catch (error) {
        res.status(500).send('Internal server error');
        console.log('Error while getting endpoint data', error);
    }
});

//CRUD for endpoints
app.get('/collections/:collectionId', async (req, res) => {
    const { collectionId } = req.params;
    if (!collectionId) {
        return res.status(400).json({ message: "Invalid collection ID" });
    }
    try {
        const keys = await redisClient.keys(`${collectionId}-*`);
        if (!(keys.length > 0)) {
            return res.status(200).json([]);
        }
        const data = await redisClient.mGet(keys);
        res.status(200).json(data);
    } catch (error) {
        res.status(500).send('Internal server error');
        console.log('Error while creating collection:', error);
    }
});

app.post("/collections/", async (req, res) => {
    const { collectionId } = req.body;
    console.log(collectionId);
    try {
        const isCollectionExists = await redisClient.keys(`${collectionId}-*`);
        if (isCollectionExists.length > 0) {
            return res.status(200).json({ message: "Collection exists" });
        }
        await redisClient.set(sampleEndpointKey(collectionId), JSON.stringify(sampleEndpointValue));
        res.sendStatus(204);
    } catch (error) {
        res.status(500).json({ message: "Internal server error" });
        console.log('Error while creating endpoint', error);
    }
});

app.post("/collections/:collectionId/endpoint", async (req, res) => {
    const { collectionId } = req.params;
    const { method, path, headers, body, statusCode } = req.body;

    if (!method || !path || !headers || !body || !statusCode) {
        return res.sendStatus(400);
    }
    try {
        const endpointKey = generateEndpointKey(collectionId, method, path);
        await redisClient.set(endpointKey, JSON.stringify({ method, path, headers, body, statusCode }));
        res.status(204).json({ message: "Endpoint created successfully" });
    } catch (error) {
        res.status(500).json({ message: "Internal server error" });
        console.log('Error while creating endpoint', error);
    }
});

app.put("/collections/:collectionId/endpoint/:endpointId", async (req, res) => {
    const { collectionId, endpointId } = req.params;
    const { method, path, headers, body, statusCode } = req.body;

    if (!method || !path || !headers || !body || !statusCode || !endpointId) {
        return res.sendStatus(400);
    }
    const endpointIdParsed = Buffer.from(endpointId, "base64").toString('utf-8');
    try {
        //Delete current endpoint data
        const endpoint = await redisClient.get(endpointIdParsed);
        if (!endpoint) {
            return res.status(400).json({ message: "Invalid endpoint ID" });
        }
        await redisClient.del(endpointIdParsed);
        const endpointKey = generateEndpointKey(collectionId, method, path);
        await redisClient.set(endpointKey, JSON.stringify({ method, path, headers, body, statusCode }));
        res.status(204).json({ message: "Endpoint created successfully" });
    } catch (error) {
        res.status(500).json({ message: "Internal server error" });
        console.log('Error while creating endpoint', error);
    }
});

app.delete("/collections/:collectionId/endpoint/:endpointId", async (req, res) => {
    const { endpointId } = req.params;
    if (!endpointId) {
        return res.status(400).json({ message: "Endpoint ID required" });
    }
    const endpointIdParsed = Buffer.from(endpointId, "base64").toString('utf-8');
    try {
        const endpoint = await redisClient.get(endpointIdParsed);
        if (!endpoint) {
            return res.status(400).json({ message: "Invalid endpoint ID" });
        }
        await redisClient.del(endpointIdParsed);
        res.sendStatus(204);
    } catch (error) {
        res.status(500).send("Internal server error");
        console.log('Error while deleting endpoint:', error);
    }
});

io.on('connection', (socket) => {
    console.log('a user connected');
    socket.on('join', (data) => {
        console.log('RequestSlug', data.collectionSlug);
        socket.join(data.collectionSlug);
    });
});


server.listen(PORT, () => console.log(`Now listening on port:${PORT}`));