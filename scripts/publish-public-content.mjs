import { execFile } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const exec = promisify(execFile);
const publicJson = new Set(['content/public/events.json', 'content/public/ratings.json', 'content/public/reviews.json', 'content/public/status.json']);

export async function publishPublicContent({ cwd = process.cwd(), env = process.env } = {}) {
  if (env.GITHUB_REF !== 'refs/heads/main' || !['push', 'schedule', 'workflow_dispatch'].includes(env.GITHUB_EVENT_NAME)) {
    throw new Error('Automatic publication requires an eligible main-branch event');
  }
  const git = async (...args) => (await exec('git', args, { cwd, env: { ...process.env, ...env } })).stdout.trim();
  await git('add', '--', 'content/public', 'sitemap.xml', ':(glob)**/*.html');
  const staged = (await exec('git', ['diff', '--cached', '--name-only', '-z'], { cwd })).stdout.split('\0').filter(Boolean);
  if (staged.some(path => !publicJson.has(path) && path !== 'sitemap.xml' && !path.endsWith('.html'))) {
    throw new Error('Publication contains a file outside the public facts and generated pages');
  }
  if (!staged.length) return { state: 'unchanged' };
  await git('config', 'user.name', 'Stay in Poznań content');
  await git('config', 'user.email', 'content@stayinpoznan.pl');
  await git('commit', '-m', 'content: refresh sourced events and ratings');
  // Never rebase or force an update over a newer human commit. A later main
  // push or scheduled cycle starts from the newly validated revision instead.
  await git('push', 'origin', 'HEAD:main');
  return { state: 'pushed', commit: await git('rev-parse', 'HEAD'), files: staged.length };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify(await publishPublicContent()));
}
