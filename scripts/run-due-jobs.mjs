import { runDueJobs } from "../lib/jobs.js";

const results = await runDueJobs();
process.stdout.write(`${JSON.stringify({ ran: results.results.length, ...results }, null, 2)}\n`);
