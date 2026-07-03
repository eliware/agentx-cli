import { fs } from '@eliware/common';
import { truncateToolOutput } from './tool-output.mjs';

export async function readFileTool(filePath) {
  try {
    const content = await fs.promises.readFile(filePath, 'utf8');
    return truncateToolOutput(content);
  } catch (error) {
    return `ERROR: ${error?.message || String(error)}`;
  }
}

export async function writeFileTool(filePath, content) {
  try {
    await fs.promises.writeFile(filePath, content, 'utf8');
    return `WROTE: ${filePath}`;
  } catch (error) {
    return `ERROR: ${error?.message || String(error)}`;
  }
}
