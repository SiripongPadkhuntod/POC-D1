FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:20-alpine AS builder
WORKDIR /app
ARG NEXT_PUBLIC_ANT_MEDIA_WEBSOCKET_URL
ARG NEXT_PUBLIC_ANT_MEDIA_PROGRAM_STREAM_ID
ENV NEXT_PUBLIC_ANT_MEDIA_WEBSOCKET_URL=$NEXT_PUBLIC_ANT_MEDIA_WEBSOCKET_URL
ENV NEXT_PUBLIC_ANT_MEDIA_PROGRAM_STREAM_ID=$NEXT_PUBLIC_ANT_MEDIA_PROGRAM_STREAM_ID
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next-build/standalone ./
COPY --from=builder /app/.next-build/static ./.next-build/static
EXPOSE 3000
CMD ["node", "server.js"]
