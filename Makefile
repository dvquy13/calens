.PHONY: build zip package clean fetch-metrics

build:
	npm run build

zip:
	cd dist && zip -r ../calens.zip . && cd ..

package: build zip
	@echo "Extension packaged successfully at calens.zip"

clean:
	rm -rf dist calens.zip

run-preview:
	npm run build-dev && npm run preview

fetch-metrics:
	gh workflow run fetch-metrics.yml
	@sleep 3
	gh run watch $$(gh run list --workflow=fetch-metrics.yml --limit=1 --json databaseId -q '.[0].databaseId') --exit-status
