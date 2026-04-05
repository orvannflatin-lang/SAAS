# Use a Node image that supports Playwright system dependencies
FROM node:20-bullseye-slim

# Install system dependencies for Playwright/Chromium
RUN apt-get update && apt-get install -y \
    libnss3 \
    libnspr4 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libxkbcommon0 \
    libxcomposite1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    librandr2 \
    libgbm1 \
    libpango-1.0-0 \
    libcairo2 \
    libasound2 \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./

# Install dependencies including Playwright
RUN npm install

# Install Playwright browsers (Chromium)
RUN npx playwright install chromium

COPY . .

# Generate Prisma Client
RUN npx prisma generate

# Build step if using TypeScript
RUN npm run build

CMD ["npm", "run", "start"]
