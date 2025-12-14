# 使用Caddy作为基础镜像
FROM caddy:alpine

# 维护者信息
LABEL maintainer="CRUD API UI"

WORKDIR /app

# 将UI文件复制到Caddy的默认静态文件目录
COPY ui/* /app/

# 复制Caddyfile配置文件
COPY Caddyfile /app/Caddyfile

# 暴露80端口
EXPOSE 80
#EXPOSE 443

# 启动Caddy服务
CMD ["caddy", "run", "--config", "/app/Caddyfile", "--adapter", "caddyfile"]