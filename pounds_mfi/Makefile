.PHONY: up down build restart logs shell db-shell migrate seed backup restore

up:
	docker-compose up -d

down:
	docker-compose down

build:
	docker-compose build --no-cache

restart:
	docker-compose restart

logs:
	docker-compose logs -f

logs-backend:
	docker-compose logs -f backend

logs-frontend:
	docker-compose logs -f frontend

shell-backend:
	docker exec -it pounds_mfi_backend sh

shell-frontend:
	docker exec -it pounds_mfi sh

db-shell:
	docker exec -it pounds_mfi_postgres psql -U $(DB_USERNAME) -d $(DB_NAME)

migrate:
	docker exec pounds_mfi_backend npm run migration:run

seed:
	docker exec pounds_mfi_backend npm run seed

backup:
	docker exec pounds_mfi_backup node dist/modules/backups/backup-worker.js manual

restore:
	@echo "Usage: make restore FILE=backup_file.sql"
	docker exec -i pounds_mfi_postgres psql -U $(DB_USERNAME) -d $(DB_NAME) < $(FILE)

status:
	docker-compose ps

ps:
	docker-compose ps
