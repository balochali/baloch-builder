import {access,cp,mkdir,readdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {spawnSync} from 'node:child_process';
if(!process.env.TARGET_DATABASE_URL||!process.argv[2])throw new Error('Set TARGET_DATABASE_URL to an empty database; supply a backup directory');
const source=resolve(process.argv[2]);await access(join(source,'database.dump'));
const destination=process.env.RESTORE_ATTACHMENT_DIR?resolve(process.env.RESTORE_ATTACHMENT_DIR):null;
if(destination){await mkdir(destination,{recursive:true});if((await readdir(destination)).length)throw new Error('Attachment restore destination must be empty');}
const executable=process.env.PG_BIN?join(process.env.PG_BIN,process.platform==='win32'?'pg_restore.exe':'pg_restore'):'pg_restore';
const result=spawnSync(executable,['--no-password','--single-transaction','--exit-on-error','--no-owner','--dbname',process.env.TARGET_DATABASE_URL,join(source,'database.dump')],{stdio:'inherit',env:{...process.env,PGCONNECT_TIMEOUT:'5'}});
if(result.error)throw result.error;if(result.status!==0)process.exit(result.status??1);
if(destination)await cp(join(source,'attachments'),destination,{recursive:true});
console.log('Restore completed. Verify Trial Balance and attachment counts before switching traffic.');
