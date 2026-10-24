import {describe,it,expect} from 'vitest';
import {entryTotals,entryFooter,isBlankLine,withBlankLine,emptyLine} from '@/features/accounting/voucherGrid';
describe('voucher grid totals and blank rows',()=>{
 it('retains exact paisa beyond floating point precision',()=>{const rows=[{account:'1220',project:'P1',debit:'90071992547409.93',credit:'0'},{account:'2000',project:'P1',debit:'0',credit:'90071992547409.93'}];expect(entryTotals(rows)).toEqual({debit:9007199254740993n,credit:9007199254740993n,difference:0n,invalid:false});expect(entryFooter(rows)._unbalanced).toBe(false);});
 it('shows imbalance and rejects malformed or two-sided amounts',()=>{expect(entryTotals([{debit:'10',credit:'0'}]).difference).toBe(1000n);for(const row of [{debit:'1.234',credit:'0'},{debit:'1',credit:'1'},{debit:'-1',credit:'0'}])expect(entryTotals([row]).invalid).toBe(true);});
 it('keeps a blank add-row without including it in totals',()=>{const rows=withBlankLine([{account:'1220',debit:'10',credit:'0'}]);expect(rows).toHaveLength(2);expect(isBlankLine(rows[1])).toBe(true);expect(withBlankLine(rows)).toHaveLength(2);expect(entryTotals([emptyLine()]).debit).toBe(0n);});
});
