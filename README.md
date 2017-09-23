# Optimized Nginx Configuration
Nginx configuration example for maximum performance.

## Table of Contents
* [Requirements](#requirements)
* [Nginx Installation](#nginx-installation)
    * [Nginx Basic Commands](#nginx-basic-commands)

## Requirements
* [Nginx](https://nginx.org) version 1.13.0 or newer 
* [PHP-FPM)(https://php-fpm.org) (If you want to setup PHP based website)

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

Check if the Nginx is running:

```bash
sudo service nginx status
```

Start the Nginx if it's not running:

```bash
sudo service nginx start
```

Stop the Nginx:

```bash
sudo service nginx stop
```

Restart the Nginx:

```bash
sudo service nginx restart
```

To test if your Nginx configuration file is valid:

```bash
sudo nginx -t
```

When you made a change to the Nginx configuration, you need to reload the Nginx configuration with the following command:

```bash
sudo service nginx reload
```
