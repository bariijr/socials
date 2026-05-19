.PHONY: install dump migrate seed clear dev help

# Load .env if present
-include .env
export

help:
	@echo "Kanegeji Parish ERP — Make targets"
	@echo ""
	@echo "  install      composer install (production, optimized)"
	@echo "  dev          composer install (development, with dev deps)"
	@echo "  dump         composer dump-autoload --optimize"
	@echo "  migrate N    run database/migrations/00N-*.sql  (e.g. make migrate N=4)"
	@echo "  seed         run database seeder"
	@echo "  clear        clear cache files in storage/cache/"
	@echo "  backup       run DB backup cron manually"
	@echo "  reminders    run pledge reminders cron manually"
	@echo ""

install:
	composer install --no-dev --optimize-autoloader

dev:
	composer install --optimize-autoloader

dump:
	composer dump-autoload --optimize

migrate:
ifndef N
	@echo "Usage: make migrate N=1  (runs migrations/001-*.sql)"
else
	mysql -h$(DB_HOST) -u$(DB_USER) -p$(DB_PASS) $(DB_NAME) < database/migrations/00$(N)-*.sql
	@echo "Migration 00$(N) applied."
endif

migrate-all:
	@for f in database/migrations/*.sql; do \
		echo "Running $$f ..."; \
		mysql -h$(DB_HOST) -u$(DB_USER) -p$(DB_PASS) $(DB_NAME) < $$f; \
	done

seed:
	php database/seeds/seed.php

clear:
	rm -f storage/cache/rl_*.json
	rm -f storage/cache/*.json
	@echo "Cache cleared."

backup:
	php cron/backup.php

reminders:
	php cron/pledge_reminders.php

budget-alerts:
	php cron/budget_alerts.php

key:
	@php -r "echo 'APP_KEY=' . bin2hex(random_bytes(32)) . PHP_EOL;"
