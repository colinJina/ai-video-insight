FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts

COPY mcp-server ./mcp-server

ENV MCP_TRANSPORT=streamable-http
ENV MCP_HTTP_HOST=0.0.0.0
ENV MCP_HTTP_PORT=3333

EXPOSE 3333

CMD ["npm", "run", "mcp:http"]
