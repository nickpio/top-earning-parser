#!/bin/bash

# Daily RTE100 Pipeline Runner
# This script should be run via cron

set -e  # Exit on error

# Change to project directory
cd "$(dirname "$0")/.."

# Activate virtual environment (if using one)
# source .venv/bin/activate

# Run the pipeline
echo "$(date): Starting RTE100 pipeline..."
python3 run_index_engine.py --rebalance-today

# Commit and push results to git
echo "$(date): Committing results..."
git add index_data/ data/
git diff --staged --quiet || git commit -m "Data for $(date +%Y-%m-%d)"
git push origin master

# Trigger Vercel deployment (optional)
# curl -X POST "$VERCEL_DEPLOY_HOOK"

echo "$(date): Pipeline completed successfully"
