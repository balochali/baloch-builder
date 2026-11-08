import {mkdir,cp} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {spawnSync} from 'node:child_process';
if(!process.env.DATABASE_URL)throw new Error('DATABASE_URL required (limited baloch_app role; SELECT is sufficient for backups)');
const destination=resolve(process.argv[2]??'backups',new Date().toISOString().replace(/[:.]/g,'-'));
await mkdir(destination,{recursive:true,mode:0o700});
const executable=process.env.PG_BIN?join(process.env.PG_BIN,process.platform==='win32'?'pg_dump.exe':'pg_dump'):'pg_dump';
const result=spawnSync(executable,['--no-password','--dbname',process.env.DATABASE_URL,'--format=custom','--file',join(destination,'database.dump')],{env:{...process.env,PGDATABASE:process.env.DATABASE_URL,PGCONNECT_TIMEOUT:"5"},stdio:'inherit'});
if(result.error)throw result.error;if(result.status!==0)process.exit(result.status??1);
if(process.env.ATTACHMENT_DIR)await cp(resolve(process.env.ATTACHMENT_DIR),join(destination,'attachments'),{recursive:true});
console.log(`Backup saved: ${destination}`);

