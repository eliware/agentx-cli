import { runImageWorker } from "./image-worker-runner.mjs";

const request = JSON.parse(process.env.AGENTX_IMAGE_REQUEST || "{}");
const result = await runImageWorker(request);
process.stdout.write(JSON.stringify(result));
