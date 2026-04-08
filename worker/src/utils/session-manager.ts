import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

export interface SessionData {
    cookies: any[];
    localStorage: Record<string, string>;
    sessionStorage: Record<string, string>;
    fingerprint: any;
    deviceInfo: {
        userAgent: string;
        viewport: { width: number; height: number };
        deviceScaleFactor: number;
        platform: string;
    };
    createdAt: string;
    lastUsed: string;
}

export class SessionManager {
    private sessionsDir: string;

    constructor() {
        this.sessionsDir = path.join(process.cwd(), 'sessions');
        if (!fs.existsSync(this.sessionsDir)) {
            fs.mkdirSync(this.sessionsDir, { recursive: true });
        }
    }

    private getSessionFilePath(username: string): string {
        return path.join(this.sessionsDir, `${username}_session.json`);
    }

    async saveSession(username: string, sessionData: SessionData): Promise<void> {
        const filePath = this.getSessionFilePath(username);
        sessionData.lastUsed = new Date().toISOString();
        fs.writeFileSync(filePath, JSON.stringify(sessionData, null, 2));
        
        // Also save to database
        await prisma.twitterAccount.updateMany({
            where: { username },
            data: { 
                sessionCookies: sessionData.cookies,
                status: 'ACTIVE'
            }
        });
    }

    async loadSession(username: string): Promise<SessionData | null> {
        const filePath = this.getSessionFilePath(username);
        
        if (fs.existsSync(filePath)) {
            const data = fs.readFileSync(filePath, 'utf-8');
            return JSON.parse(data);
        }
        
        // Fallback to database
        const account = await prisma.twitterAccount.findFirst({
            where: { username },
            select: { sessionCookies: true }
        });
        
        if (account?.sessionCookies) {
            return {
                cookies: account.sessionCookies as any[],
                localStorage: {},
                sessionStorage: {},
                fingerprint: null,
                deviceInfo: {
                    userAgent: '',
                    viewport: { width: 390, height: 844 },
                    deviceScaleFactor: 3,
                    platform: 'iPhone'
                },
                createdAt: new Date().toISOString(),
                lastUsed: new Date().toISOString()
            };
        }
        
        return null;
    }

    async sessionExists(username: string): Promise<boolean> {
        const filePath = this.getSessionFilePath(username);
        const account = await prisma.twitterAccount.findFirst({
            where: { username },
            select: { sessionCookies: true }
        });
        const hasDbCookies = !!(account?.sessionCookies && Array.isArray(account.sessionCookies) && (account.sessionCookies as any[]).length > 0);
        return fs.existsSync(filePath) || hasDbCookies;
    }

    async deleteSession(username: string): Promise<void> {
        const filePath = this.getSessionFilePath(username);
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }
        
        await prisma.twitterAccount.updateMany({
            where: { username },
            data: { sessionCookies: [], status: 'WARM_UP' }
        });
    }

    isSessionValid(sessionData: SessionData): boolean {
        const lastUsed = new Date(sessionData.lastUsed);
        const now = new Date();
        const hoursSinceLastUse = (now.getTime() - lastUsed.getTime()) / (1000 * 60 * 60);
        
        // Session expires after 7 days of inactivity
        return hoursSinceLastUse < 168;
    }
}

export const sessionManager = new SessionManager();
