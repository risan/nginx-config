# Optimized Nginx Configuration

Nginx configuration example for maximum performance.

## Table of Contents
* [Requirements](#requirements)
* [Nginx Installation](#nginx-installation)
    * [Nginx Basic Commands](#nginx-basic-commands)
* [Installation](#installation)
* [Quick Start Guide](#quick-start-guide)
* [Configuration Directory Structure](#configuration-directory-structure)
    * [conf.d](#confd)
    * [logs](#logs)
    * [sites-available](#sites-available)
    * [sites-enabled](#sites-enabled)
    * [sites-example](#sites-example)
    * [snippets](#snippets)
        * [directive](#directive)
        * [location](#location)
    * [ssl](#ssl)
    * [mime.types](#mimetypes)
    * [nginx.conf](#nginxconf)
* [Basic Configurations](#basic-configurations)
    * [`listen`](#the-listen-directive)
    * [`server_name`](#the-server_name-directive)
    * [Redirect to non-www server name](#redirect-to-non-www-server-name)
    * [`root`](#the-root-directive)
    * [`index`](#the-index-directive)
    * [`try_files`](#the-try_files-directive)
    * [`error_page`](#the-error_page-directive)
    * [`error_log`](#the-error_log-directive)
    * [`access_log`](#the-access_log-directive)
* [Drop Request to an Unknown Server Name](#drop-request-to-an-unknown-server-name)
* [Setup New Website](#setup-new-website)
* [Setup PHP Website](#setup-php-website)
* [Setup Reverse Proxy](#setup-reverse-proxy)
* [Free SSL Certificate with Let's Encrypt](#free-ssl-certificate-with-lets-encrypt)
    * [Certbot Installation](#certbot-installation)
    * [Get SSL Certificate](#get-ssl-certificate)
* [Setup SSL Website](#setup-ssl-website)
* [Advanced Configurations](#advanced-configurations)
    * [`user`](#the-user-directive)
    * [`worker_processes`](#the-worker_processes-directive)
    * [`worker_rlimit_nofile`](#the-worker_rlimit_nofile-directive)
    * [`worker_connections`](#the-worker_connections-directive)
    * [`server_names_hash_max_size`](#the-server_names_hash_max_size-and-server_names_hash_bucket_size-directives) and [`server_names_hash_bucket_size`](#the-server_names_hash_max_size-and-server_names_hash_bucket_size-directives)
    * [`types_hash_max_size`](#the-types_hash_max_size-and-types_hash_bucket_size-directives) and [`types_hash_bucket_size`](#the-types_hash_max_size-and-types_hash_bucket_size-directives)
    * [`sendfile`](#the-sendfile-directive)
    * [`tcp_nopush`](#the-tcp_nopush-directive)
    * [`tcp_nodelay`](#the-tcp_nodelay-directive)
    * [`keepalive_timeout`](#the-keepalive_timeout-directive)
    * [Gzip related directives](#gzip-related-directives)
* [Credits](#credits)

## Requirements

The following packages are required to use this configuration example:
* [Git](https://git-scm.com) for installation
* [Nginx](https://nginx.org) version 1.13.0 or newer 
* [PHP-FPM](https://php-fpm.org) (If you want to setup PHP based website)

## Nginx Installation
The following steps will guide you to install the latest stable version of Nginx on Ubuntu or any Debian based Linux distros.

To get the latest stable version of Nginx, you need to add the `nginx/stable` PPA to your the repository:

```bash
sudo add-apt-repository -y ppa:nginx/stable
```

Next, update your package index file and finally install the Nginx.

```
sudo apt-get update
sudo apt-get install -y nginx
```

### Nginx Basic Commands

Here are some basic commands you can use to work with Nginx:

```bash
# Check if the Nginx is running:
sudo service nginx status

# Start the Nginx if it's not running:
sudo service nginx start

# Stop the Nginx:
sudo service nginx stop

# Restart the Nginx:
sudo service nginx restart

# To test if your Nginx configuration file is valid:
sudo nginx -t

# When you made a change to the Nginx configuration, 
# you need to reload the Nginx configuration with the following command:
sudo service nginx reload
```

## Installation
To install this optimized Nginx configuration on your machine, you simply need to replace your `nginx` configuration directory with this repository. 

It's always a good idea to backup your current Nginx configuration directory:

```bash
sudo mv /etc/nginx /etc/nginx.bak
```

Then download this repository to replace it:
```bash
sudo git clone https://github.com/risan/nginx-config.git /etc/nginx
```

> Note that this repository only provides you with website configuration examples that you can easily copy.

## Quick Start Guide

Make sure you already have [Nginx installed](#nginx-installation). First, you need to backup your current Nginx configuration directory:

```bash
sudo mv /etc/nginx /etc/nginx.bak
```

Next, you have to download this repository to replace your Nginx configuration:

```bash
sudo git clone https://github.com/risan/nginx-config.git /etc/nginx
```

Now, suppose you have a website project stored within the `/var/www/awesome.com` directory and you want it to be served from `awesome.com` domain. First, you have to copy the `/etc/sites-example/site.conf` to `sites-available` directory:

```bash
sudo cp /etc/sites-example/site.conf /etc/sites-available/awesome.com
```

Secondly, you need to edit the copied configuration file to match your project detail. Open it up in using your favorite text editor:

```bash
# Open it up with Vim
sudo vim /etc/sites-available/awesome.com
```

Replace all of the occuring `example.com` with `awesome.com`. Also make sure that `root` directive is pointing out to the correct location of your website:

```nginx
# For brevity only show the lines that need to be changed.

server {
    ...

    # The www host server name.
    server_name www.awesome.com;

    # Redirect to the non-www version.
    return 301 $scheme://awesome.com$request_uri;
}

server {
    ...

    # The non-www host server name.
    server_name awesome.com;

    # The document root path.
    root /var/www/awesome.com

    ...

    # Log configuration.
    error_log /etc/nginx/logs/awesome.com_error.log error;
    access_log /etc/nginx/logs/awesome.com_access.log main;

    ...
}
```

Once your changes have been saved, create a symbolic link to your configuration file within the `sites-enabled` directory:

```bash
sudo ln -sfv /etc/nginx/sites-available/awesome.com /etc/nginx/sites-enabled/
```

To test that your configuration file has no errors, run the following commands:

```bash
sudo nginx -t
```

If there are no errors found, you can finally tell Nginx to reload the configuration file like so:

```bash
sudo service nginx reload
```

Now your website under the `/var/www/awesome.com` directory should be available from the `http://awesome.com` URL.

## Configuration Directory Structure

Here's an overview of this Nginx configuration directory structure:

```
|-- conf.d                  # Your costom configuration
|-- logs                    # Nginx website logs directory
|-- sites-available         # Your available website configurations
|-- sites-enabled           # Your enabled website configurations
|-- sites-example           # Website configuration examples
|   |-- no-default.conf
|   |-- site.conf
|   |-- site-ssl.conf
|   |-- php.conf
|   |-- php-ssl.conf
|   |-- proxy.conf
|   |-- proxy-ssl.conf
|-- snippets                # Configuration snippets
|   |-- directive
|   |-- location
|-- ssl                     # SSL certificates directory
|-- mime.types              # MIME types list
|-- nginx.conf              # Main configurations
```

### conf.d
All of your custom Nginx configurations should be defined here. If you check the `nginx.conf` file, you'll see that all of the files with `.conf` extension within this directory will be included.

### logs
By default, this is where all of the Nginx error & access log files will be stored.

### sites-available
This is where you'll store your website configuration files. Note that configuration files stored here are not automatically available to Nginx, you still have to create a symbolic link within the `sites-enabled` directory.

### sites-enabled
This directory holds all of the enabled website configurations. Usually, this directory only contains symbolic links to the actual configuration files in `sites-available` directory.

### sites-example
This is where all of the website configuration examples that you can easily copy are stored. Currently, there are 7 configuration examples that you can use:

* `no-default.conf` => To drop request to an unknown server name
* `site.conf` => Basic website configuration
* `site-ssl.conf` => Basic website configuration with SSL
* `php.conf` => PHP based website configuration
* `php-ssl.conf` => PHP based website configuration with SSL
* `proxy.conf` => Reverse proxy configuration
* `proxy-ssl.conf` => Reverse proxy configuration with SSL

### snippets
This is where you'll find all of the reusable Nginx configuration snippets are. You'll see that some of these snippets are being included on the website configuration examples. There are two directories within it:

#### directive
This directory holds all of the snippets that contain only a directive configurations (the directives that are not set within any specific block).

* `ssl.conf` => Snippet for SSL configuration
* `fastcgi.conf` => Parameters setup for FastCGI server
* `fastcgi-php.conf` => FastCGI parameters for PHP
* `proxy.conf` => Configuration for proxied website
* `websocket-proxy.conf` => Proxy setup for websocket support

#### location
This is where all of the snippets with configuration directives being set within the `location` block goes.

* `cache-control.conf` => The `Cahce-Control` header configuration for some static files
* `protect-sensitive-files.conf` => Protection for sensitive files

> Note that the `add_header` directive set on the `location` block will replace the other `add_header` directives that are being set on its parent block or any less specific `location` block.

So if you include the `cache-control.conf` on your website configuration, all of the static files that are configured within the `cache-control.conf` snippets won't inherit any headers you've set on the parent block or any less specific `location` block. To work around this, you have to set your header on a specific `location` block:

```nginx
location ~* \.json$ {
    add_header Access-Control-Allow-Origin "*";
}
```

### ssl
This is where DHE ciphers parameters and all of the SSL certificates will be stored. Usually, you'll just create symbolic links here that point out to the real certificate path.

### mime.types
This is the file where you can map file extensions to its MIME types.

### nginx.conf
This is the main Nginx configuration file.

## Basic Configurations

Here are some basic configurations that are commonly found on website configuration examples at `sites-example` directory.

### The `listen` directive
This is where you set the port number on which Nginx will listen to. The defaults are port `80` for HTTP and `443` for HTTPS:

```nginx
server {
    listen 80;
    listen [::]:80; # This is for IPv6
    ...
}

# For SSL website with HTTP/2 protocol
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    ...
}
```

### The `server_name` directive
This is where you set names of the virtual server. Note that the first name will become the primary server name.

```nginx
server {
    ...
    server_name example.com www.example.com;
}
```

### Redirect to non-www server name
As you might have noticed, the first `server` block on all of the website configuration examples are dealing with a redirection from a www version to the non-www version (e.g. from www.example.com to example.com).

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name www.example.com;

    # Redirect to the non-www version.
    return 301 $scheme://example.com$request_uri;
}
```

* `301` is the HTTP status code that is set for the response, which means "moved permanently".
* `$request_uri` is the Nginx embedded variable that holds a full original request URI

### The `root` directive
This is where you set the root directory for requests.

```nginx
root /var/www/example.com/public;
```

### The `index` directive
You can use this directive to define the files that will be used as an index. Note that the files will be checked in the specified order.

```nginx
index index.html index.htm;
```

### The `try_files` directive
This is the list of files that will be used to serve a request. It will be checked in the given order.

```nginx
location / {
    try_files $uri $uri/ =404;
}
```

From the above snippet, first Nginx will check if the given `$uri` match any file. If there's no match, it will try to serve it as a directory. Or else it will fallback to display the 404 page.

### The `error_page` directive
This directive can be used to set a URI for a custom error pages.

```nginx
# Custom 404 page.
error_page 404 /404.html;
```

### The `error_log` directive
This directive allows you to set the path to the log file. You can also set the log level to any of the following options: `debug`, `info`, `notice`, `warn`, `error`, `crit`, `alert`, or `emerg`.

```nginx
error_log /etc/nginx/logs/example.com_error.log error;
```

### The `access_log` directive
This is where you set the path to the request log file. For performance reason, you can also set this directive `off` to disable the request log.

```nginx
access_log /etc/nginx/logs/example.com_access.log main;
```

`main` is referring to the access log format defined on `nginx.conf` file.

## Drop Request to an Unknown Server Name

If a client requests for an unknown server name and there's no default server name defined, by default Nginx will serve the first server configuration found. To prevent this, you have to create a configuration for a default server name where you'll drop the request.

First, copy the `no-default.conf` example:

```bash
sudo cp /etc/nginx/sites-example/no-default.conf /etc/nginx/sites-available/no-default
```

Secondly, create a symbolic link to this configuration file within the `sites-enabled` directory:

```bash
sudo ln -sfv /etc/nginx/sites-available/no-default /etc/nginx/sites-enabled/
```

Make sure that there's no error on the configuration file:

```bash
sudo nginx -t
```

Then finally reload your Nginx configuration:
```bash
sudo service nginx reload
```

## Setup New Website

This section will guide you to set up new static files based website (HTML/CSS/JS) using the available `site.conf` example. Suppose you've put your website project on `/var/www/awesome.com` directory and will serve all of the static files from `/var/www/awesome.com/public` directory.

You've also got the `awesome.com` domain name setup where this website will be served. First, you need to copy the `site.conf` configuration example to `sites-available`:

```bash
sudo cp /etc/nginx/sites-example/site.conf /etc/nginx/sites-available/awesome.com
```

Then open up the copied file with your favorite editor:

```bash
# Open it up in VIM
sudo vim /etc/nginx/sites-available/awesome.com
```

Replace all of the references to `example.com` with your `awesome.com` domain:

```nginx
# For brevity only show the lines that need to be changed.

server {
    ...

    # The www host server name.
    server_name www.awesome.com;

    # Redirect to the non-www version.
    return 301 $scheme://awesome.com$request_uri;
}

server {
    ...

    # The non-www host server name.
    server_name awesome.com;

    # The document root path.
    root /var/www/awesome.com

    ...

    # Log configuration.
    error_log /etc/nginx/logs/awesome.com_error.log error;
    access_log /etc/nginx/logs/awesome.com_access.log main;

    ...
}
```

Next, you need to create a symbolic link within the `sites-enabled` directory that points out to this configuration file:

```bash
sudo ln -sfv /etc/sites-available/awesome.com /etc/sites-enabled/
```

Make sure that there are no errors on the new configuration file:

```bash
sudo nginx -t
```

Lastly reload your Nginx configuration with the following command:

```bash
sudo service nginx reload
```

That's it, your website should now be served under the `awesome.com` domain.

## Setup PHP Website

To set up a new PHP based website, the steps are quite similar to [Setup New Website](#setup-new-website) section. But instead of `site.conf`, you'll be using the `php.conf` example file as a base.

Suppose you already set up a domain named `awesome.com` and you'll serve any incoming request from this root directory: `/var/www/awesome.com/public`. Copy the `php.conf` file first:

```bash
sudo cp /etc/nginx/sites-example/php.conf /etc/nginx/sites-available/awesome.com
```

Then open it up with your favorite editor:

```bash
# Open it up in VIM
sudo vim /etc/nginx/sites-available/awesome.com
```

Replace all of the references to `example.com` with your `awesome.com` domain.

```nginx
# For brevity only show the lines that need to be changed.

server {
    ...

    # The www host server name.
    server_name www.awesome.com;

    # Redirect to the non-www version.
    return 301 $scheme://awesome.com$request_uri;
}

server {
    ...

    # The non-www host server name.
    server_name awesome.com;

    # The document root path.
    root /var/www/awesome.com/public;

    ...

    # Pass PHP file to FastCGI server.
    location ~ \.php$ {
        include snippets/directive/fastcgi-php.conf;

        # With php-fpm or other unix sockets.
        fastcgi_pass unix:/run/php/php7.1-fpm.sock;

        # With php-cgi or other tcp sockets).
        # fastcgi_pass 127.0.0.1:9000;
    }

    ...

    # Log configuration.
    error_log /etc/nginx/logs/awesome.com_error.log error;
    access_log /etc/nginx/logs/awesome.com_access.log main;

    ...
}
```

You also need to set up the FastCGI address correctly with `fastcgi_pass` directive. Suppose you'll use the PHP-FPM as the gateway and connect it through Unix socket in `/run/php/php7.1-fpm.sock`:

```nginx
location ~ \.php$ {
    include snippets/directive/fastcgi-php.conf;

    fastcgi_pass unix:/run/php/php7.1-fpm.sock;

    # Or if you happen to connect it through TCP port.
    # fastcgi_pass 127.0.0.1:9000;
}
```

Next, create a symbolic link to this file within the `sites-enabled` directory:

```bash
sudo ln -sfv /etc/nginx/sites-available/awesome.com /etc/nginx/sites-enabled/
```

Test your new configuration file and make sure that there are no errors:

```bash
sudo nginx -t
```

Finally, reload your Nginx configuration:

```bash
sudo service nginx reload
```

## Setup Reverse Proxy

You can use the `proxy.conf` example file as a base to create a reverse proxy site configuration. For example, if you have a Node.JS application running locally on port `3000`, you can expose it to the internet through a reverse proxy.

Suppose you've set up a domain named `awesome.com` to use. First, you need to copy the `proxy.conf` file to the `sites-available` directory:

```bash
sudo cp /etc/nginx/sites-example/proxy.conf /etc/nginx/sites-available/awesome.com
```

Open the copied file with your favorite editor:

```bash
# Open it up in VIM
sudo vim /etc/nginx/sites-available/awesome.com
```

Then replace all of the references to `example.com` with your `awesome.com` domain:

```nginx
# For brevity only show the lines that need to be changed.

# Group of servers that will be proxied to.
upstream backend {
    server localhost:3000;
}

server {
    ...

    # The www host server name.
    server_name www.awesome.com;

    # Redirect to the non-www version.
    return 301 $scheme://awesome.com$request_uri;
}

server {
    ...

    # The non-www host server name.
    server_name awesome.com;

    # The document root path.
    root /var/www/awesome.com/public;

    ...

    # Log configuration.
    error_log /etc/nginx/logs/awesome.com_error.log error;
    access_log /etc/nginx/logs/awesome.com_access.log main;

    ...
}
```

Make sure that you also set the correct target server on the first `upstream` block. Note that you can also define multiple servers on which the request will be proxied to:

```nginx
upstream backend {
    server localhost:3000;
}
```

The `backend` is just a name of the group of servers, so you easily refer to it within other blocks, it can be anything.

Since the Nginx is really good at serving static files, the example configuration will let all of the static files under the given `root` directive being served solely by Nginx—not being proxied to the app.

```nginx
server {
    ...

    root /var/www/example.com/public;

    location / {
        # First attempt to serve request as a file, then proxy it to the
        # backend group.
        try_files $uri @backend;
    }

    ...
}
```

The next step would be to create a symbolic link within the `sites-enabled` that refers to this config file:

```bash
sudo ln -sfv /etc/nginx/sites-available/awesome.com /etc/nginx/sites-enabled/
```

Test your new configuration file and make sure that there are no errors:

```bash
sudo nginx -t
```

Lastly, reload your Nginx configuration with the following command:

```bash
sudo service nginx reload
```

## Free SSL Certificate with Let's Encrypt

In order to set up an SSL website, you're going to need a valid SSL certificate. The good news is that you can get it for free from [Let's Encrypt](https://letsencrypt.org).

### Certbot Installation

On this section, you'll be guided to retrieve a free SSL certificate from Let's Encrypt using the [Certbot](https://certbot.eff.org). First, you need to add the `certbot/certbot` PPA to your repository list:

```bash
sudo add-apt-repository ppa:certbot/certbot
```

Next, update your packages index and install the `python-certbot-nginx`:

```bash
sudo apt-get update
sudo apt-get install -y python-certbot-nginx 
```

### Get SSL Certificate

Suppose you want to generate an SSL certificate for your `awesome.com` and `www.awesome.com` domains. The first thing you need to do is to set up the non-SSL version of your website. You can refer to the [Setup New Website](#setup-new-website) section for this. 

Note that within your website configuration you need to include the `snippets/basic.conf` or `snippets/location/protect-sensitive-files.conf` snippets. This snippet will allow client to access the `.well-known` directory thus allowing the `certbot` client verifying our domain.

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name awesome.com;
    ...

    # Include basic configuration.
    include snippets/basic.conf;
}
```

Next, on your terminal run the following command:

```bash
sudo certbot --nginx certonly
```

Just follow the instruction, the `certbot` will guide you. Or if you want to automate it and be done with just one single command, you can do this:

```bash
sudo certbot certonly --webroot -w /var/www/awesome.com/public -d awesome.com -d www.awesome.com -n -m johndoe@awesome.com --agree-tos
```

* `--webroot` => Use the webroot plugin
* `-w` => The root directory of your website
* `-d` => The domain name of your website
* `-n` => Use the non-interactive mode
* `-m` => Email address for notification
* `--agree-tos` => Agree to TOS

The `certbot` will generate the SSL certificate under the `/etc/letsencrypt/live/awesome.com`. There will be four types of files available to you:

* `fullchain.pem` => Contain all of the certificates (server certificate and follow by any other intermediates)
* `privkey.pem` => The private key for your certificate
* `cert.pem` => The server certificate
* `chain.pem` => Holds additional intermediate certificates

And that's it, you've just got yourself your own SSL certificate ready to use for your website.

## Setup SSL Website

Before setting up a new SSL website, you need to generate strong DH parameters for the DHE ciphers and store it within the `ssl` directory:

```bash
sudo openssl dhparam -out /etc/nginx/ssl/dhparam.pem 4096
```

Within the `sites-example` directory there is an SSL version for each of the website configuration type:

- `site-ssl.conf` => For static files based website (HTML/JS/CSS)
- `php-ssl.conf` => For PHP based website
- `proxy-ssl.conf` => For reverse proxy site

To set up the SSL version, the steps are quite similar to the non-SSL version explained in the previous sections. You just need to copy the configuration example from the SSL version and set the correct path for the SSL certificate.

```nginx
# SSL certificate file.
ssl_certificate ssl/awesome.com/fullchain.pem;

# SSL certificate secret key file.
ssl_certificate_key ssl/awesome.com/privkey.pem;

# SSL trusted CA certificate file for OCSP stapling.
ssl_trusted_certificate ssl/awesome.com/chain.pem;
```

You can just drop your SSL certificate files under the `/etc/nginx/ssl/awesome.com` directory or create a symlink that points to the real path. Or if you happen to use the Let's Encrypt certificate from the previous section, you create it like so:

```bash
sudo ln -sfv /etc/letsencrypt/live/awesome.com /etc/nginx/ssl/
```

Once everything is set up, don't forget to test your configuration file first:

```bash
sudo nginx -t
```

Then tells Nginx to reload your new configuration:

```bash
sudo service nginx reload
```

## Advanced Configurations

### The `user` directive
This is where you define the `user` and the `group` for the Nginx worker processes. For security purposes, make sure that this is set to the user and group with limited privileges.

```nginx
user www-data www-data;
```

### The `worker_processes` directive
This directive is used to set the number of worker processes. The optimum value depends on the number of CPU cores, the number of hard drives, and many other factors. Setting it to the number of CPU cores is good starting point, but if you're unsure you can just leave it set to `auto`.

```nginx
worker_processes auto;
```

Here's the basic formula for calculating the maximum number of connections:

```
Max. number of connections = worker_processes * worker_connections
```

### The `worker_rlimit_nofile` directive
Use this directive to set the maximum number of open files (the `RLIMIT_NOFILE`) for worker processes. Set this directive more than the `worker_connections`.

```nginx
worker_rlimit_nofile 8192;
```

### The `worker_connections` directive
This directive sets the maximum number of simultaneous connections that can be opened by the worker processes. Note that this is not only connections with clients but also any other internal connections (e.g. connections with the proxy server).

```nginx
events {
    worker_connections 8000;
}
```

### The `server_names_hash_max_size` and `server_names_hash_bucket_size` directives
If you defined a large set of server names, you'll probably need to increase either the `server_names_hash_max_size` or the `server_names_hash_bucket_size` values. It's recommended that you increase the `server_names_hash_max_size` value first, usually close to the number of server names.

```nginx
server_names_hash_max_size 1024;
server_names_hash_bucket_size 32;
```

By default, the`server_names_hash_bucket_size` is equal to the processor's cache line size. If you want to update it, the value must be a multiple of it  (e.g. 32/64/128).

### The `types_hash_max_size` and `types_hash_bucket_size` directives
This is where you define the maximum hash size (`types_hash_max_size`) and it's hash bucket size (`types_hash_bucket_size`) for storing MIME types data in hash table.

```nginx
types_hash_max_size 2048;
types_hash_bucket_size 32;
```

### The `sendfile` directive
This directive is used to enable/disable the use of `sendfile()`. If it's set to `on`, it can speed up static file transfers by using the `sendfile()` rather than the `read()` and `write()` combination. This is because `sendfile()` has the ability to transfer data directly from the file descriptor.

```nginx
sendfile on;
```

For FreeBSD user, you also have to set the `aio` directive in order to use this feature.

```nginx
sendfile on;
aio on;
```

### The `tcp_nopush` directive
This directive is used to enable/disable the `TCP_CORK` socket option (the `TCP_NOPUSH` option on FreeBSD). Setting it to `on` can optimize the amount of data that is being sent at once. This will prevent Nginx from sending a partial frame. As a result, it will increase the throughput since TCP frames will be filled up before being sent out.

```nginx
tcp_nopush on;
```

Note that you'll also need to activate the `sendfile` directive in order to enable this option.

### The `tcp_nodelay` directive
You can set this directive to enable/disable the `TCP_NODELAY` option. By default, the TCP stack implements a mechanism to delay sending the data up to 200ms. This is to make sure that it won't send a packet that would be too small.

However, nowadays chances are so small that our files won't fill up the buffer immediately. Thus we can turn `on` this option to force the socket to send the data in its buffer immediately.

```nginx
tcp_nodelay on;
```

### The `keepalive_timeout` directive
This directive is used to set a timeout of which a keep-alive connection will stay open. The longer the duration is, the better for the client, especially on SSL connection. The downside is the worker connection is occupied much longer.

```nginx
keepalive_timeout 20s;
```

### Gzip related directives
To enable Gzip compression, you can set the `gzip` directive to `on`:

```nginx
gzip on;
```

There are also several other directives you can set related to gzip:

* `gzip_comp_level` => The gzip compression level (1-9). 5 is a perfect compromise between size and CPU usage, offering about 75% reduction for most ASCII files (almost identical to level 9).
* `gzip_min_length` => The minimum length of a response that will be gzipped. Don't compress a small file that is unlikely to shrink much. The small file is also usually ended up in larger file sizes after gzipping.
* `gzip_proxied` => Enables or disables gzipping of responses for proxied connection.
* `gzip_vary` => Enables or disables inserting the “Vary: Accept-Encoding” header in response.

## Credits

All of these configurations setup are gathered from the following resources:

* [Nginx Documentation](http://nginx.org/en/docs/)
* [Nginx Configs Boilerplate](https://github.com/h5bp/server-configs-nginx) by [h5bp](https://h5bp.github.io)
* [Nginx Optimization](https://t37.net/nginx-optimization-understanding-sendfile-tcp_nodelay-and-tcp_nopush.html) by [Fred de Villamil](https://t37.net)



