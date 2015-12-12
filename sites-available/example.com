server {
  listen 80;
  listen [::]:80;
  server_name www.example.com;
  return 301 $scheme://example.com$request_uri;
}

server {
  listen 80;
  listen [::]:80;
  charset utf-8;
  server_name example.com;

  root /sites/example.com/public;
  index index.html index.htm;

  location / {
    try_files $uri $uri/ =404;
  }

  error_log  /etc/nginx/logs/example.com_error.log warn;
  access_log /etc/nginx/logs/example.com_access.log main;

  error_page 404 /404.html;
  include conf.d/basic.conf;
}
