FROM node:22-alpine
WORKDIR /app
RUN apk add --no-cache openssl
COPY package.json ./
RUN npm install
COPY prisma ./prisma
COPY tsconfig.json ./
COPY src ./src
COPY seed ./seed
RUN npm run build
ENV NODE_ENV=production PORT=4000
EXPOSE 4000
CMD ["npm","start"]
