.PHONY: up down restart logs logs-antmedia status test

up:
	docker compose up -d --build

down:
	docker compose down

restart:
	docker compose restart

logs:
	docker compose logs -f

logs-antmedia:
	docker compose logs -f antmedia

status:
	docker compose ps

test:
	cd services/source-registry && go test ./...
	cd services/frontend && npm run lint
	cd services/frontend && npm run build
