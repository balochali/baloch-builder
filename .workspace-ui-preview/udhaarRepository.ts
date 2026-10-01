export {CreateUdhaarSchema,AddUdhaarPaymentSchema} from '../src/data/repositories/udhaarRepository';
export async function listUdhaars(){return [
{id:'11111111-1111-4111-8111-111111111111',borrower_name:'Ali Khan',phone:'03001234567',amount:1200000,paid_amount:300000,payment_count:1,given_date:'2026-09-01',due_date:'2026-11-01',notes:null,created_at:'2026-09-01'},
{id:'22222222-2222-4222-8222-222222222222',borrower_name:'Ahmed Baloch',phone:'03009876543',amount:800000,paid_amount:0,payment_count:0,given_date:'2026-09-08',due_date:'2026-09-20',notes:null,created_at:'2026-09-08'},
{id:'33333333-3333-4333-8333-333333333333',borrower_name:'Bilal Ahmed',phone:'',amount:500000,paid_amount:500000,payment_count:1,given_date:'2026-09-03',due_date:null,notes:null,created_at:'2026-09-03'}];}
export async function listAllUdhaarPayments(){return [
{id:'pay1',udhaar_id:'11111111-1111-4111-8111-111111111111',amount:300000,paid_date:'2026-09-15',method:'cash',notes:null},
{id:'pay2',udhaar_id:'33333333-3333-4333-8333-333333333333',amount:500000,paid_date:'2026-09-25',method:'cash',notes:null}];}
export async function createUdhaar(){throw new Error('Read-only preview');}
export const addPersonUdhaarPayment=createUdhaar;
