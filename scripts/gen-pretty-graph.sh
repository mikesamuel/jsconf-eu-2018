#!/bin/bash

set -e

npm run prestart

neato -Gsplines=true -Goverlap=false -Tsvg \
      <(cat generated/prod-sources.dot | perl -pe 's|node_modules/|/|g') \
      > generated/prod-sources.svg
