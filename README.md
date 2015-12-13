# Nginx Configuration for Ubuntu

This is my personal collection of Nginx server configuration snippets for Ubuntu 14.04 Trusty. Originally came from the [H5BP Server Configs Nginx](https://github.com/h5bp/server-configs-nginx).

## Install Nginx

To install Nginx on your Ubuntu machine, run the following commands:

```bash
sudo apt-get update
sudo apt-get install nginx
```

If you installed Nginx on your local machine, verify it by visiting:

```bash
http://localhost
```

Or if you installed it on the remote machine and it's publicily available, visit the IP address:

```bash
http://XXX.XXX.XXX.XXX
```

You can also check if the Nginx server is running by excecuting the following command:

```bash
/etc/init.d/nginx status
```

Some useful commands to start / stop/ restart the Nginx server:

```bash
sudo service nginx start
sudo service nginx stop
sudo service nginx restart
```

## Download Nginx Configuration

Once you have the Nginx server installed, download this Nginx configuration files to your machine.

But first, we need to stop the Nginx service:

```bash
sudo service nginx stop
```

Backup the original Nginx configuration directory:

```bash
sudo mv /etc/nginx /etc/nginx-original
```

Make sure that you have Git installed on your machine. Then download this repository to replace the `/etc/nginx/` directory using git command:

```bash
sudo git clone https://github.com/risan/nginx-config-ubuntu.git /etc/nginx
```

## Setup Virtual Host (Server Blocks)

To set a virtual host or we called it *Server Blocks* on Nginx, we simply need to copy the available `example.com` config file on `/etc/nginx/sites-available` directory. For example, we'll be creating a new config file for `your-website.com`:

```bash
sudo cp /etc/nginx/sites-available/example.com /etc/nginx/sites-available/your-website.com
```

Now open up the copied configuration file to see and edit the directives according to your own need:

```bash
sudo nano /etc/nginx/sites-available/your-website.com
```

### The first server block

The first server block, will redirect the request from `www.example.com` to the `example.com`.

```nginx
server {
  listen 80;
  listen [::]:80;
  server_name www.example.com;
  return 301 $scheme://example.com$request_uri;
}
```

To configure this first server block, simply replacing the `example.com` value with your own domain name.

### The second server block

The second server block will actually process the HTTP request.

```
server {
  listen 80;
  listen [::]:80;
  charset utf-8;
  server_name example.com;

  root /path/to/document-root;
  index index.html index.htm;

  location / {
    try_files $uri $uri/ =404;
  }

  error_log  /etc/nginx/logs/example.com_error.log warn;
  access_log /etc/nginx/logs/example.com_access.log main;

  error_page 404 /404.html;
  include conf.d/basic.conf;
}
```

There are few things that you can configure on this second server block:

**Update Server Name**

Update the `server_name` directive to reflect your domain name:

```
server_name your-website.com
```

**Update Document Root**

Update the `root` directive to match your website document root directory. For example if your website document root is located at `/var/www/your-website.com/public`, then the directive value would be:

```
root /var/www/your-website.com/public
```

**Update Logs Path**

And lastly we can specify the log files path. We recomend to store the log files at `/etc/nginx/logs` directory and each virtual host has its own log file like so:

```
error_log  /etc/nginx/logs/your-website.com_error.log warn;
access_log /etc/nginx/logs/your-website.com_access.log main;
```

### Complete Example

```
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
  server_name risan.io;

  root /var/www/example.com/public;
  index index.html index.htm;

  location / {
    try_files $uri $uri/ =404;
  }

  error_log  /etc/nginx/logs/example.com_error.log warn;
  access_log /etc/nginx/logs/example.com_access.log main;

  error_page 404 /404.html;
  include conf.d/basic.conf;
}
```

## Setup SSL Server Block

If you want to use SSL for your website, copy the configuration file from `/etc/nginx/sites-available/example.com-ssl`

```
sudo cp /etc/nginx/sites-available/example.com-ssl /etc/nginx/sites-available/your-website.com
```

Once it's get copied, open it up to configure some directives:

```
sudo nano /etc/nginx/sites-available/your-website.com
```

### The First Server Block

The first server block will redirect non-SSL request both from `http://example.com` and `http://www.example.com` to `https://example.com`.

```
server {
  listen 80;
  listen [::]:80;
  server_name example.com www.example.com;

  return 301 https://example.com$request_uri;
}
```

To configure this first server block, simply replacing the `example.com` text with your own domain name.

### The Second Server Block

The second server block will redirect traffic from `https://www.example.com` to the `https://example.com`. It also specifies the SSL certificates path.

```
server {
  listen 443 ssl spdy;
  listen [::]:443 ssl spdy;
  server_name www.example.com;

  include conf.d/directive-only/ssl.conf;
  ssl_certificate /etc/nginx/ssl/example.com/fullchain.pem;
  ssl_certificate_key /etc/nginx/ssl/example.com/privkey.pem;

  include conf.d/directive-only/ssl-stapling.conf;
  ssl_trusted_certificate /etc/nginx/ssl/example.com/chain.pem;

  return 301 https://example.com$request_uri;
}
```

On the second server block, we need to configure several things:

**Update Server Name**

We need to update the `server_name` directive to reflect our own server name:

```
server_name your-website.com
```

** Specify SSL Certifiate Path**

Next we need to specify the SSL certificate path. We recomend you to create a symlink from your original certificate location to the `/etc/nginx/ssl` directory.

```
ssl_certificate /etc/nginx/ssl/ssl-certificate.crt;
ssl_certificate_key /etc/nginx/ssl/ssl-secret-key.key;
```

**SSL Stapling**

If you want to enable SSL stapling, also specify the `ssl_trusted_certificate` directive to your trusted CS certificate file:

```
ssl_trusted_certificate /etc/nginx/ssl/your-website-ca.crt
```

If you want to disable SSL sapling, comment out the following directives:

```
# include conf.d/directive-only/ssl-stapling.conf;
# ssl_trusted_certificate /etc/nginx/ssl/risan.io/chain.pem;
```

**Update the Redirection URI**

Also don't forget to update the redirection URI at the bottom of the server block.

```
return 301 https://your-website.com$request_uri;
```

### The Third Server Block

The third server block will actually process the request.

```
server {
  listen 443 ssl spdy;
  listen [::]:443 ssl spdy;
  charset utf-8;
  server_name example.com;

  include conf.d/directive-only/ssl.conf;
  ssl_certificate /etc/nginx/ssl/example.com/fullchain.pem;
  ssl_certificate_key /etc/nginx/ssl/example.com/privkey.pem;

  include conf.d/directive-only/ssl-stapling.conf;
  ssl_trusted_certificate /etc/nginx/ssl/example.com/chain.pem;

  root /path/to/document-root;
  index index.html index.htm;

  location / {
    try_files $uri $uri/ =404;
  }

  error_log  /etc/nginx/logs/example.com_error.log warn;
  access_log /etc/nginx/logs/example.com_access.log main;

  error_page 404 /404.html;
  include conf.d/basic.conf;
}
```

On this last server block, we need to configure the following directives:

**Update Server Name**

Update the `server_name` to macth your domain name:

```
server_name your-website.com
```

**SSL Configuration**

The SSL configuration is identical to the second server block:

```
include conf.d/directive-only/ssl.conf;
ssl_certificate /path/to/ssl-certificate.crt;
ssl_certificate_key /path/to/ssl-private-key.key;

include conf.d/directive-only/ssl-stapling.conf;
ssl_trusted_certificate /path/to/trusted-ca-certificate.crt;
```

**Update Document Root**

Update the `root` directive to the document root of your website. For example if our website document root is located in `/var/www/your-website.com/public`, the directive would be:

```
root /var/www/your-website.com/public;
```

**Specify The Log Files Path**

Lastly, specify the log files location. We recommend you to store log files on `/etc/nginx/logs` directory and each virtual host has their own log file.

```
error_log  /etc/nginx/logs/example.com_error.log warn;
access_log /etc/nginx/logs/example.com_access.log main;
```

### Complete Example

```
server {
  listen 80;
  listen [::]:80;
  server_name risan.io www.risan.io;

  return 301 https://risan.io$request_uri;
}

server {
  listen 443 ssl spdy;
  listen [::]:443 ssl spdy;
  server_name www.risan.io;

  include conf.d/directive-only/ssl.conf;
  ssl_certificate /etc/nginx/ssl/risan.io/fullchain.pem;
  ssl_certificate_key /etc/nginx/ssl/risan.io/privkey.pem;

  include conf.d/directive-only/ssl-stapling.conf;
  ssl_trusted_certificate /etc/nginx/ssl/risan.io/chain.pem;

  return 301 https://risan.io$request_uri;
}

server {
  listen 443 ssl spdy;
  listen [::]:443 ssl spdy;
  charset utf-8;
  server_name example.com;

  include conf.d/directive-only/ssl.conf;
  ssl_certificate /path/to/ssl-certificate.crt;
  ssl_certificate_key /path/to/ssl-private-key.key;

  include conf.d/directive-only/ssl-stapling.conf;
  ssl_trusted_certificate path/to/ca-certificate.crt;

  root /path/to/document-root;
  index index.html index.htm;

  location / {
    try_files $uri $uri/ =404;
  }

  error_log  /etc/nginx/logs/your-website.com_error.log warn;
  access_log /etc/nginx/logs/your-website.com.log main;

  error_page 404 /404.html;
  include conf.d/basic.conf;
}
```
