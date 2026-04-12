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

# Install ALL dependencies first (including devDependencies like tsc)
COPY package*.json ./
RUN npm install

# Install Playwright browsers (Chromium)
RUN npx playwright install chromium --with-deps

# Copy source code
COPY . .

# Generate Prisma Client
RUN npx prisma generate

# Build the application (tsc is now available)
RUN npm run build

# Set production mode ONLY after build
ENV NODE_ENV production

CMD ["xvfb-run", "--server-args=-screen 0 1280x1024x24", "npm", "start"]
