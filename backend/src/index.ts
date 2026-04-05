import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { PrismaClient } from '@prisma/client';
import { Queue } from 'bullmq';
import IORedis from 'ioredis';

dotenv.config();

const app = express();
const prisma = new PrismaClient();
const port = process.env.PORT || 4000;

// Redis Connection for Queue
const redisConnection = new IORedis(process.env.REDIS_URL || 'redis://redis:6379', {
    maxRetriesPerRequest: null,
});

// BullMQ Queue
const instagramQueue = new Queue('instagram-actions', { connection: redisConnection });

// HTTP & Socket.io Server
const httpServer = createServer(app);
const io = new Server(httpServer, {
    cors: { origin: "*", methods: ["GET", "POST"] }
});

app.use(cors());
app.use(express.json());

// --- API ENDPOINTS ---

/**
 * Health Check
 */
app.get('/health', (req, res) => {
    res.json({ status: 'ok', service: 'backend' });
});

/**
 * Get all accounts
 */
app.get('/api/accounts', async (req, res) => {
    const accounts = await prisma.iGAccount.findMany({
        include: { proxy: true }
    });
    res.json(accounts);
});

/**
 * Add a new account + proxy
 */
app.post('/api/accounts', async (req, res) => {
    const { username, password, proxy } = req.body;

    try {
        const newAccount = await prisma.iGAccount.create({
            data: {
                username,
                password,
                userId: 'temp-user-id', // Simplified for now
                proxy: proxy ? {
                    create: {
                        host: proxy.host,
                        port: parseInt(proxy.port),
                        username: proxy.username,
                        password: proxy.password
                    }
                } : undefined
            }
        });
        res.status(201).json(newAccount);
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
});

/**
 * Trigger an automation action
 */
app.post('/api/accounts/:id/action', async (req, res) => {
    const { id } = req.params;
    const { action } = req.body; // e.g., 'warmUp', 'follow'

    try {
        const job = await instagramQueue.add(action, { accountId: id, action });
        res.json({ jobId: job.id, message: `Action ${action} queued successfully.` });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// --- SOCKET.IO LOGIC ---
io.on('connection', (socket) => {
    socket.on('worker_log', (data) => io.emit('ui_log', data));
    socket.on('worker_screenshot', (data) => io.emit('ui_screenshot', data));
    socket.on('worker_state', (data) => io.emit('ui_state', data));
});

httpServer.listen(port, () => {
    console.log(`Backend API & Queue running on http://localhost:${port}`);
});
