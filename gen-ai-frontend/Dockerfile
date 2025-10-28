# Use Node.js for building
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

# This image doesn't actually run anything,
# it just holds the built files in /app/dist
# We will copy these files out in the CI/CD step later