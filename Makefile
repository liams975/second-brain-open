.PHONY: dev start-api start-dash setup-cron test-cron lint build stop book

dev:
	@echo "API → http://localhost:3001  Dashboard → http://localhost:3000"
	@(cd api && node src/index.js) & (cd dashboard && npm run dev) & wait

start-api:
	cd api && node src/index.js

start-dash:
	cd dashboard && npm run dev

setup-cron:
	cd scripts && bash setup-launchd.sh

test-cron:
	cd scripts && node daily-cron.js --dry-run

book:
	@read -p "Title: " title; read -p "Author: " author; \
	cd scripts && node book-note.js "$$title" "$$author"

lint:
	cd dashboard && npm run lint

build:
	cd dashboard && npm run build

stop:
	-lsof -ti:3000 | xargs kill -9 2>/dev/null; lsof -ti:3001 | xargs kill -9 2>/dev/null
	@echo "Stopped servers."
