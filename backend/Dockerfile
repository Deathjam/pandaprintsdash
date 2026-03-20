FROM node:18-bullseye-slim
WORKDIR /usr/src/app
COPY package*.json ./
RUN npm install
COPY . .
EXPOSE 3001 8080
CMD [ "node", "server.js" ]
