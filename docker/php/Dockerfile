FROM php:8.3-fpm-alpine

RUN apk add --no-cache libxml2 oniguruma \
    && apk add --no-cache --virtual .build-deps $PHPIZE_DEPS libxml2-dev oniguruma-dev \
    && docker-php-ext-install pdo pdo_mysql mbstring soap \
    && apk del .build-deps

WORKDIR /var/www/backend
