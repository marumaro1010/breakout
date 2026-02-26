# Node.js API 伺服器
FROM node:20-alpine

WORKDIR /app

# 複製 package.json 並安裝依賴
COPY package*.json ./
RUN npm install --production

# 複製程式碼
COPY . .

# 暴露連接埠
EXPOSE 3000

# 啟動指令
CMD ["node", "index.js"]
