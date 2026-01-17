# syntax=docker/dockerfile:1

FROM node:20-alpine

# Create app directory
WORKDIR /app

# Install production dependencies first (better layer caching)
COPY package*.json ./
RUN npm ci --omit=dev

# Copy source
COPY src ./src
COPY *.js ./

# Ensure upload/output folders exist inside the container
RUN mkdir -p /app/resumes /app/parsed

# Default port (DigitalOcean/containers typically set PORT)
ENV NODE_ENV=production
ENV PORT=5000

EXPOSE 5000

CMD ["npm", "start"]
