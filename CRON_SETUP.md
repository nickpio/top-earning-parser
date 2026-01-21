# Setting Up Automated Daily Pipeline

This guide explains how to automatically run the RTE100 pipeline daily.

## Option 1: GitHub Actions (Recommended)

GitHub Actions can run your Python pipeline on a schedule and commit the results.

### Setup Steps:

1. The workflow file is already created at `.github/workflows/daily-pipeline.yml`

2. Configure the schedule in the YAML file (currently set to 6 AM UTC):
   ```yaml
   schedule:
     - cron: '0 6 * * *'  # Adjust as needed
   ```

3. (Optional) Add a Vercel Deploy Hook for auto-deployment:
   - Go to your Vercel project settings
   - Navigate to "Git" → "Deploy Hooks"
   - Create a new hook and copy the URL
   - Add it as a GitHub secret: `VERCEL_DEPLOY_HOOK`

4. Commit and push the workflow file:
   ```bash
   git add .github/workflows/daily-pipeline.yml
   git commit -m "Add daily pipeline workflow"
   git push
   ```

5. The pipeline will now run automatically daily. You can also trigger it manually:
   - Go to GitHub → Actions → "Daily RTE100 Pipeline" → "Run workflow"

### Cron Schedule Examples:
- `0 6 * * *` - Daily at 6:00 AM UTC
- `0 14 * * *` - Daily at 2:00 PM UTC (9 AM EST)
- `0 0 * * 1` - Weekly on Monday at midnight
- `0 */6 * * *` - Every 6 hours

## Option 2: Vercel Cron Jobs

For lightweight tasks, Vercel offers built-in cron jobs (5-minute max execution).

### Setup Steps:

1. Add environment variable in Vercel dashboard:
   - `CRON_SECRET` - A random secret string for authentication

2. The files are created:
   - `gui/vercel.json` - Cron configuration
   - `gui/src/app/api/cron/run-pipeline/route.ts` - API endpoint

3. Deploy to Vercel:
   ```bash
   cd gui
   vercel --prod
   ```

**Note**: This may not work well for long-running Python pipelines due to Vercel's 5-minute timeout.

## Option 3: Traditional Cron Job (Server-based)

If you have access to a Linux server or Mac:

### Setup Steps:

1. Make the script executable (already done):
   ```bash
   chmod +x scripts/run_daily_pipeline.sh
   ```

2. Edit your crontab:
   ```bash
   crontab -e
   ```

3. Add this line (adjust path and time):
   ```
   0 6 * * * /Users/nickpio/Desktop/top-earning-parser/scripts/run_daily_pipeline.sh >> /tmp/rte100-pipeline.log 2>&1
   ```

4. Save and exit. The pipeline will run daily at 6 AM.

5. View logs:
   ```bash
   tail -f /tmp/rte100-pipeline.log
   ```

## Option 4: Cloud Scheduler Services

Other options for scheduling:
- **AWS EventBridge** + Lambda
- **Google Cloud Scheduler** + Cloud Run
- **Azure Logic Apps**
- **Railway** (cron jobs)
- **Render** (cron jobs)

## Recommended Setup

For your use case, I recommend **GitHub Actions** because:
- ✅ Free for public repos
- ✅ Runs Python natively
- ✅ Auto-commits results to git
- ✅ Can trigger Vercel deployments
- ✅ Easy to monitor and debug
- ✅ No server maintenance required

## Monitoring

After setup, monitor your pipeline:
- GitHub Actions: Check the "Actions" tab in your repo
- Vercel Cron: Check the "Logs" in Vercel dashboard
- Server Cron: Check `/tmp/rte100-pipeline.log`

## Troubleshooting

If the pipeline fails:
1. Check GitHub Actions logs for error messages
2. Ensure all dependencies are in `requirements.txt`
3. Verify Playwright browsers are installed
4. Check git permissions for auto-commit
5. Test manually: `python run_index_engine.py --rebalance-today`
