FROM node:20-slim

# 安装系统依赖
RUN apt-get update && \
    apt-get install -y git build-essential curl unzip && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# 必须先复制 package.json 并安装依赖
COPY package.json ./
RUN npm install

# 再复制其他文件
COPY . .

# 关键：如果你的 deploy.js 是网页服务，确保监听 7860
EXPOSE 7860

CMD ["node", "deploy.js"]
