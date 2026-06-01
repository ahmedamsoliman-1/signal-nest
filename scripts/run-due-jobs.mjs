import { runDueJobs } from "../lib/jobs.js";

const results = await runDueJobs();
process.stdout.write(`${JSON.stringify(results, null, 2)}\n`);
