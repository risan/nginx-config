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
This is where DHE chippers parameters and all of the SSL certificates will be stored. Usually, you'll just create symbolic links here that point out to the real certificate path.

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
