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

Once you have the Nginx server installed, download this Nginx configuration files to your machine. But first, we need to stop the Nginx service:

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

    # The www host name.
    server_name www.example.com;

    # Redirect to the non-www.
    return 301 $scheme://example.com$request_uri;
}
```

To configure this first server block, simply replace the `example.com` values with your own domain name.

### The second server block

The second server block will actually process the HTTP request. The second server block will actually look like this:

```nginx
server {
    listen 80;
    listen [::]:80;

    # The host name.
    server_name example.com;

    # The root path.
    root /etc/share/nginx/exmaple.com;

    # Specify charset.
    charset utf-8;

    # Index file.
    index index.html index.htm;

    # Try file then directory, or else 404.
    location / {
        try_files $uri $uri/ =404;
    }

    # Custom 404 error page.
    error_page 404 /404.html;

    # Log file path.
    error_log  /etc/nginx/logs/example.com_error.log warn;
    access_log /etc/nginx/logs/example.com_access.log main;

    # Include basic config.
    include conf.d/basic.conf;
}
```

There are few things that you can configure on the second server block:

**Update Server Name**

Update the `server_name` directive to reflect your domain name:

```nginx
server_name your-website.com
```

**Update Document Root**

Update the `root` directive to match your website document root directory. For example if your website document root is located at `/var/www/your-website.com/public`, then the directive value would be:

```
root /var/www/your-website.com/public
```

**Update Logs Path**

And lastly we can specify the log files path. We recomend to store the log files at `/etc/nginx/logs` directory and each virtual host has its own log file like so:

```nginx
error_log  /etc/nginx/logs/your-website.com_error.log warn;
access_log /etc/nginx/logs/your-website.com_access.log main;
```

### Complete Example

Here is the complete example of the server blocks for `example.com` domain:

```nginx
server {
    listen 80;
    listen [::]:80;

    # The www host name.
    server_name www.example.com;

    # Redirect to the non-www.
    return 301 $scheme://example.com$request_uri;
}

server {
    listen 80;
    listen [::]:80;

    # The host name.
    server_name example.com;

    # The root path.
    root /etc/share/nginx/exmaple.com;

    # Specify charset.
    charset utf-8;

    # Index file.
    index index.html index.htm;

    # Try file then directory, or else 404.
    location / {
        try_files $uri $uri/ =404;
    }

    # Custom 404 error page.
    error_page 404 /404.html;

    # Log file path.
    error_log  /etc/nginx/logs/example.com_error.log warn;
    access_log /etc/nginx/logs/example.com_access.log main;

    # Include basic config.
    include conf.d/basic.conf;
}
```

## Setup SSL Server Block

If you want to use SSL for your website, copy the configuration file from `/etc/nginx/sites-available/example.com-ssl` instead.

```bash
sudo cp /etc/nginx/sites-available/example.com-ssl /etc/nginx/sites-available/your-website.com
```

Once it's get copied, open it up to configure some directives:

```bash
sudo nano /etc/nginx/sites-available/your-website.com
```

### The First Server Block

The first server block will redirect non-SSL request both from `http://example.com` and `http://www.example.com` to `https://example.com`.

```nginx
server {
    listen 80;
    listen [::]:80;

    # The www and non-www http hostnames.
    server_name example.com www.example.com;

    # Redirect to non-www https hostname.
    return 301 https://example.com$request_uri;
}
```

To configure the first server block, simply replace the `example.com` text with your own domain name.

### The Second Server Block

The second server block will redirect traffic from `https://www.example.com` to the `https://example.com`. It also specifies the SSL certificates path.

```nginx
server {
    listen 443 ssl spdy;
    listen [::]:443 ssl spdy;

    # The www hostname.
    server_name www.example.com;

    # SSL config file.
    include conf.d/directive-only/ssl.conf;

    # SSL certificate.
    ssl_certificate /etc/nginx/ssl/example.com/fullchain.pem;
    ssl_certificate_key /etc/nginx/ssl/example.com/privkey.pem;

    # Enable OCSP stapling.
    include conf.d/directive-only/ssl-stapling.conf;

    # Intermediate certificate.
    ssl_trusted_certificate /etc/nginx/ssl/example.com/chain.pem;

    # Redirect to non-www https hostname.
    return 301 https://example.com$request_uri;
}
```

On the second server block, we need to configure several things:

**Update Server Name**

We need to update the `server_name` directive to match our own domain name:

```nginx
server_name your-website.com
```

** Specify SSL Certifiate Path**

Next we need to specify the SSL certificate path. We recomend you to create a symlink from your original certificate location to the `/etc/nginx/ssl` directory.

```nginx
ssl_certificate /etc/nginx/ssl/ssl-certificate.crt;
ssl_certificate_key /etc/nginx/ssl/ssl-secret-key.key;
```

**SSL Stapling**

If you want to enable SSL stapling, also specify the `ssl_trusted_certificate` directive to your trusted CS certificate file:

```nginx
ssl_trusted_certificate /etc/nginx/ssl/your-website-ca.crt
```

If you want to disable SSL stapling, comment out the following directives:

```nginx
# Enable OCSP stapling.
# include conf.d/directive-only/ssl-stapling.conf;

# Intermediate certificate.
# ssl_trusted_certificate /etc/nginx/ssl/example.com/chain.pem;
```

**Update the Redirection URI**

Also don't forget to update the redirection URI at the bottom of the server block.

```nginx
return 301 https://your-website.com$request_uri;
```

### The Third Server Block

The third server block will actually process the request. This last server block will look exactly like this:

```nginx
server {
    listen 443 ssl spdy;
    listen [::]:443 ssl spdy;

    # The host name.
    server_name example.com;

    # SSL config file.
    include conf.d/directive-only/ssl.conf;

    # SSL certificate.
    ssl_certificate /etc/nginx/ssl/example.com/fullchain.pem;
    ssl_certificate_key /etc/nginx/ssl/example.com/privkey.pem;

    # Enable OCSP stapling.
    include conf.d/directive-only/ssl-stapling.conf;

    # Intermediate certificate.
    ssl_trusted_certificate /etc/nginx/ssl/example.com/chain.pem;

    # The root path.
    root /sites/example.com/public;

    # Specify charset.
    charset utf-8;

    # Index file.
    index index.html index.htm;

    # Try file then directory, or else 404.
    location / {
        try_files $uri $uri/ =404;
    }

    # Custom 404 error page.
    error_page 404 /404.html;

    # Log file path.
    error_log  /etc/nginx/logs/example.com-ssl_error.log warn;
    access_log /etc/nginx/logs/example.com-ssl_access.log main;

    # Include basic config.
    include conf.d/basic.conf;
}
```

On the last server block, we need to configure the following directives:

**Update Server Name**

Just like on the previous server block, update the `server_name` to match your domain name like so:

```nginx
server_name your-website.com
```

**SSL Configuration**

The SSL configuration directive is identical to the second server block:

```nginx
# SSL config file.
include conf.d/directive-only/ssl.conf;

# SSL certificate.
ssl_certificate /etc/nginx/ssl/example.com/fullchain.pem;
ssl_certificate_key /etc/nginx/ssl/example.com/privkey.pem;

# Enable OCSP stapling.
include conf.d/directive-only/ssl-stapling.conf;

# Intermediate certificate.
ssl_trusted_certificate /etc/nginx/ssl/example.com/chain.pem;
```

**Update Document Root**

Update the `root` directive to the document root of your website. For example if our website document root is located in `/var/www/your-website.com/public`, then this directive would look like this:

```nginx
root /var/www/your-website.com/public;
```

**Specify The Log Files Path**

Lastly, specify the log files location. We recommend you to store log files on `/etc/nginx/logs` directory and each virtual host has their own log file.

```nginx
error_log  /etc/nginx/logs/example.com_error.log warn;
access_log /etc/nginx/logs/example.com_access.log main;
```

### Complete Example

Here is the complete example of the server blocks that use SSL protocol:

```nginx
server {
    listen 80;
    listen [::]:80;

    # The www and non-www http hostnames.
    server_name example.com www.example.com;

    # Redirect to non-www https hostname.
    return 301 https://example.com$request_uri;
}

server {
    listen 443 ssl spdy;
    listen [::]:443 ssl spdy;

    # The www hostname.
    server_name www.example.com;

    # SSL config file.
    include conf.d/directive-only/ssl.conf;

    # SSL certificate.
    ssl_certificate /etc/nginx/ssl/example.com/fullchain.pem;
    ssl_certificate_key /etc/nginx/ssl/example.com/privkey.pem;

    # Enable OCSP stapling.
    include conf.d/directive-only/ssl-stapling.conf;

    # Intermediate certificate.
    ssl_trusted_certificate /etc/nginx/ssl/example.com/chain.pem;

    # Redirect to non-www https hostname.
    return 301 https://example.com$request_uri;
}

server {
    listen 443 ssl spdy;
    listen [::]:443 ssl spdy;

    # The host name.
    server_name example.com;

    # SSL config file.
    include conf.d/directive-only/ssl.conf;

    # SSL certificate.
    ssl_certificate /etc/nginx/ssl/example.com/fullchain.pem;
    ssl_certificate_key /etc/nginx/ssl/example.com/privkey.pem;

    # Enable OCSP stapling.
    include conf.d/directive-only/ssl-stapling.conf;

    # Intermediate certificate.
    ssl_trusted_certificate /etc/nginx/ssl/example.com/chain.pem;

    # The root path.
    root /sites/example.com/public;

    # Specify charset.
    charset utf-8;

    # Index file.
    index index.html index.htm;

    # Try file then directory, or else 404.
    location / {
        try_files $uri $uri/ =404;
    }

    # Custom 404 error page.
    error_page 404 /404.html;

    # Log file path.
    error_log  /etc/nginx/logs/example.com-ssl_error.log warn;
    access_log /etc/nginx/logs/example.com-ssl_access.log main;

    # Include basic config.
    include conf.d/basic.conf;
}
```
