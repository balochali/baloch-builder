// @vitest-environment node
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {it,expect} from 'vitest';
it('preserves all protected design assets, tokens and shared components',()=>{
 const manifest=JSON.parse(readFileSync('docs/DESIGN_LOCK.json','utf8')) as {files:Record<string,string>};
 for(const [path,digest] of Object.entries(manifest.files)){const bytes=path.endsWith('.png')?readFileSync(path):readFileSync(path,'utf8').replace(/\r\n/g,'\n');expect(createHash('sha256').update(bytes).digest('hex'),path).toBe(digest);}
});
