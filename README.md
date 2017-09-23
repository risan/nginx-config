# Optimized Nginx Configuration
Nginx configuration example for maximum performance.

## Table of Contents
* [Requirements](#requirements)
* [Nginx Installation](#nginx-installation)
    * [Nginx Basic Commands](#nginx-basic-commands)
* [Installation](#installation)
* [Quick Start Guide](#quick-start-guide)
* [Configuration Directory Structure](#configuration-directory-structure)
    * [conf.d](#conf.d)
    * [logs](#logs)
    * [sites-available](#sites-available)
    * [sites-enabled](#sites-enabled)
    * [sites-examples](#sites-examples)
    * [snippets](#snippets)
        * [directive](#directive)
        * [location](#location)
    * [ssl](#ssl)
    * [mime.types](#mime.types)
    * [nginx.conf](#nginx.conf)

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
|-- conf.d          # Your costom configuration
|-- logs            # Nginx website logs directory
|-- sites-available # Your available website configurations
|-- sites-enabled   # Your enabled website configurations
|-- sites-examples  # Website configuration examples
|   |-- no-default.conf
|   |-- site.conf
|   |-- site-ssl.conf
|   |-- php.conf
|   |-- php-ssl.conf
|   |-- proxy.conf
|   |-- proxy-ssl.conf
|-- snippets        # Configuration snippets
|   |-- directive
|   |-- location
|-- ssl             # SSL certificates directory
|-- mime.types      # MIME types list
|-- nginx.conf      # Main configurations
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
This is where all of the reusable Nginx configuration snippets are stored. There are two main directories within it:

#### directive
Configuration snippets that are only contain directive:

* `ssl.conf` => Snippet for SSL configuration
* `fastcgi.conf` => Parameters setup for FastCGI server
* `fastcgi-php.conf` => FastCGI parameters for PHP
* `proxy.conf` => Configuration for proxied website
* `websocket-proxy.conf` => Proxy setup for websocket support

#### Location
Configuration snippets that contain within the `location` scope:

* `cache-control.conf` => `Cahce-Control` header configuration for some static files
* `protect-sensitive-files.conf` => Protection for sensitive files

### ssl
This is where DHE chipers parameters and all of the SSL certificates will be stored.

### mime.types
This is the file where you can map file extensions to MIME types.

### nginx.conf
This is the main Nginx configuration file.
