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
    * [sites-examples](#sites-examples)
    * [snippets](#snippets)
        * [directive](#directive)
        * [location](#location)
    * [ssl](#ssl)
    * [mime.types](#mimetypes)
    * [nginx.conf](#nginxconf)
* [Basic Configurations](#basic-configurations)

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

Now, suppose you have a website project stored within the `/var/www/awesome.com` directory and you want it to be served from `awesome.com` domain. First, you have to copy the `/etc/sites-examples/site.conf` to `sites-available` directory:

```bash
sudo cp /etc/sites-examples/site.conf /etc/sites-available/awesome.com
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
|-- sites-examples          # Website configuration examples
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

### sites-examples
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

### Redirect to Non-WWW server name
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
