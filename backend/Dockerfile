# syntax=docker/dockerfile:1
FROM node:20-alpine

WORKDIR /app

# Install deps
COPY package*.json ./
RUN npm ci --omit=dev

# Copy entire src + required files
COPY . .

# Create required folders
RUN mkdir -p /app/resumes /app/parsed

ENV NODE_ENV=production
ENV PORT=9090
ENV HOST=0.0.0.0

EXPOSE 9090

CMD ["npm", "start"]
