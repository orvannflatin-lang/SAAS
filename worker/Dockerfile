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
    libxrandr2 \
    libgbm1 \
    libpango-1.0-0 \
    libcairo2 \
    libasound2 \
    ffmpeg \
    xvfb \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Enable development mode
ENV NODE_ENV development

COPY package*.json ./
RUN npm install

# Install Playwright browsers (Chromium)
RUN npx playwright install chromium --with-deps

COPY . .

# Generate Prisma Client
RUN npx prisma generate

CMD ["npm", "run", "dev"]
