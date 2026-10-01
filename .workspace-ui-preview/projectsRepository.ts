export {CreateProjectSchema} from '../src/data/repositories/projectsRepository';
export async function listProjects(){return [
{id:'p1',name:'Baloch Residency',code:'01',location:'Gul Muhammad Lane',status:'planning',start_date:'2026-09-23',description:'Residential development',archived:0,custom:'{}',created_at:'2026-09-23',updated_at:'2026-09-23'},
{id:'p2',name:'Garden Heights',code:'02',location:'Quetta',status:'under construction',start_date:'2026-05-10',description:'Apartments and retail spaces',archived:0,custom:'{}',created_at:'2026-05-10',updated_at:'2026-05-10'},
{id:'p3',name:'Coastal Homes',code:'03',location:'Karachi',status:'completed',start_date:'2025-01-15',description:'Family residences',archived:0,custom:'{}',created_at:'2025-01-15',updated_at:'2025-01-15'},
{id:'p4',name:'Park View',code:'04',location:'Quetta',status:'on hold',start_date:null,description:'',archived:0,custom:'{}',created_at:'2026-08-01',updated_at:'2026-08-01'}];}
export async function createProject(){throw new Error('Read-only preview');}
