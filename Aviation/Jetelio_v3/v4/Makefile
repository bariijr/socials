.PHONY: up down logs migrate seed import test lint build ps restart

up:
	docker compose up --build -d

down:
	docker compose down

restart: down up

logs:
	docker compose logs -f --tail=200

ps:
	docker compose ps

build:
	docker compose build

migrate:
	docker compose run --rm api alembic upgrade head

seed import:
	docker compose run --rm api python -m app.importer.cli /app/data/JTLlayout-Index_admin.xlsx

test:
	docker compose run --rm api-test pytest -q

lint:
	docker compose run --rm api-test ruff check app
