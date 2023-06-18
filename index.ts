import express from "express";
import { createClient } from "redis";
import dotenv from "dotenv";
import { sampleEndpointKey, sampleEndpointValue } from "./utils";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 8000;

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
    if (req.url.startsWith('/api')) {
        return next();
    }
    const endpointKey = generateEndpointKey(req.subdomains[0], req.method, req.path);
    try {
        const rawEndpointData = await redisClient.get(endpointKey);
        if (!rawEndpointData) {
            return res.sendStatus(404);
        }
        const endpointData = JSON.parse(rawEndpointData);
        res.status(endpointData.statusCode).send(endpointData.body);
    } catch (error) {
        res.status(500).send('Internal server error');
        console.log('Error while getting endpoint data', error);
    }
});

//CRUD for endpoints
app.get('/api/collection/:collectionId', async (req, res) => {
    const { collectionId } = req.params;
    if (!collectionId) {
        return res.status(400).json({ message: "Invalid collection ID" });
    }
    try {
        const keys = await redisClient.keys(`${collectionId}-*`);
        const data = await redisClient.mGet(keys);
        res.status(200).json(data);
    } catch (error) {
        res.status(500).send('Internal server error');
        console.log('Error while creating collection:', error);
    }
});

app.post("/api/collection/:collectionId", async (req, res) => {
    const { collectionId } = req.params;
    try {
        const isCollectionExists = await redisClient.keys(`${collectionId}-*`);
        if (isCollectionExists) {
            return res.status(400).json({ message: "Collection Id already taken" });
        }
        await redisClient.set(sampleEndpointKey(collectionId), JSON.stringify(sampleEndpointValue));
        res.sendStatus(204);
    } catch (error) {
        res.status(500).json({ message: "Internal server error" });
        console.log('Error while creating endpoint', error);
    }
});

app.post("/api/collection/:collectionId/endpoint", async (req, res) => {
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

app.put("/api/collection/:collectionId/endpoint", async (req, res) => {
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

app.delete("/api/collection/:collectionId/endpoint/:endpointId", async (req, res) => {
    const { endpointId } = req.params;
    if (!endpointId) {
        return res.status(400).json({ message: "Endpoint ID required" });
    }
    try {
        const endpoint = redisClient.get(endpointId);
        if (!endpoint) {
            return res.status(400).json({ message: "Invalid endpoint ID" });
        }
        redisClient.del(endpointId);
    } catch (error) {
        res.status(500).send("Internal server error");
        console.log('Error while deleting endpoint:', error);
    }
});


app.listen(PORT, () => console.log(`Now listening on port:${PORT}`));