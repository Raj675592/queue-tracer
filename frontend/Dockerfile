FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
# Build the production assets into the /dist folder
RUN npm run build
# Open up your custom frontend port
EXPOSE 5173
CMD ["npm", "run", "preview"]