# syntax=docker/dockerfile:1
FROM node:20-bookworm-slim

WORKDIR /app

# Install Python runtime and pip for the hybrid matcher.
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 python3-pip \
    && rm -rf /var/lib/apt/lists/*

# Install Node dependencies first to maximize Docker layer caching.
COPY package*.json ./
RUN npm ci --omit=dev

# Install Python dependencies used by src/ml/hybrid_matcher.py.
COPY requirements.txt ./
RUN pip3 install --no-cache-dir -r requirements.txt

# Copy application source.
COPY . .

# Create runtime folders used by uploads and parsed outputs.
RUN mkdir -p /app/resumes /app/parsed

ENV NODE_ENV=production
ENV PORT=9090
ENV HOST=0.0.0.0
ENV PYTHON_BIN=python3

EXPOSE 9090

CMD ["npm", "start"]
