docker-build:
	docker build -t voiss-demo-page .

docker-run:
	docker run -p 3000:3000 voiss-demo-page

npm-build:
	npm run build

npm-start:
	npm run start

dev:
	npm run dev