FROM node:18-alpine

WORKDIR /app

COPY package*.json ./

RUN npm install --production

COPY . .

# Create necessary directories
RUN mkdir -p auth_info baileys_store

# Expose ports
EXPOSE 3000
EXPOSE 3001

# Start both servers
CMD ["sh", "-c", "node pair.js & node index.js"]
