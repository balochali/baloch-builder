import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';
export default defineConfig({root:import.meta.dirname,plugins:[react(),tailwindcss()],resolve:{alias:[...['projectsRepository','udhaarRepository','contactsRepository'].map(name=>({find:'@/data/repositories/'+name,replacement:path.resolve(import.meta.dirname,name+'.ts')})),{find:'@',replacement:path.resolve(import.meta.dirname,'../src')}]},server:{host:'127.0.0.1',port:1428,strictPort:true,fs:{allow:[path.resolve(import.meta.dirname,'..')]}}});
