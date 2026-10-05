import fs from 'node:fs';
const path = 'src/features/projects/components/ProjectProfitLossPanel.tsx';
let text = fs.readFileSync(path, 'utf8');
text = text.replace('useState, type FormEvent', 'useState').replace('Wallet, X', 'Wallet');
text = text.replace('addPartnerPayout, listPartnerPayouts, type PartnerPayout, type PartnerPayoutInput', 'listPartnerPayouts, type PartnerPayout');
text = text.replace('import { accountName } from "@/domain/bankAccount";', 'import { PartnerPayoutDialog } from "./PartnerPayoutDialog";');
text = text.replace(/  const \[saving, setSaving\][\s\S]*?(?=  useEffect)/, '');
text = text.replace(/  async function savePayout[\s\S]*?(?=  return <section)/, '');
text = text.replace('setSelected(partner); setFormError("");', 'setSelected(partner);');
text = text.replace(/    \{selected && <div className="project-profit-overlay"[^\n]+/, '    {selected && <PartnerPayoutDialog projectId={projectId} partner={selected} onClose={() => setSelected(null)} onSaved={async () => { setPayouts(await listPartnerPayouts(projectId)); }} />}');
fs.writeFileSync(path, text);

const files = ['CreditUdhaarPage', 'PersonalExpensePage', 'ProjectDetailPage', 'ProjectPartnerDialog', 'UdhaarPaymentDetails'];
const titles = { bank: 'Bank transfer', digital: 'Digital wallet', cheque: 'Cheque', cash: 'Cash', other: 'Other' };
for (const name of files) {
  const file = `src/test/features/${name}.test.tsx`;
  let s = fs.readFileSync(file, 'utf8');
  s = s.replace(/screen\.queryAllByLabelText\(/g, 'screen.queryAllByLabelText(');
  s = s.replace(/screen\.queryAllByLabelText\(\/\^\(Pay from\|Receive into\) account\/\)/g, 'screen.queryAllByRole("radio", { name: "Builder Account" })');
  s = s.replace(/fireEvent\.change\(account, \{ target: \{ value: "builder" \} \}\);/g, 'fireEvent.click(account);');
  s = s.replace(/fireEvent\.change\(screen\.getByLabelText\((?:"(?:Receive into|Pay from) account \*"|\/(?:Receive into|Pay from) account\/)\),\s*\{\s*target: \{ value: "(personal|builder)" \},?\s*\}\);/g, (_, value) => `fireEvent.click(screen.getByRole("radio", { name: "${value === 'personal' ? 'Personal' : 'Builder'} Account" }));`);
  s = s.replace(/fireEvent\.change\(screen\.getByLabelText\("(?:How was it paid\? \*|Payment method(?: \*)?)"\),\s*\{ target: \{ value: "(bank|digital|cheque|cash|other)" \} \}\);/g, (_, value) => `fireEvent.click(screen.getByRole("button", { name: "${titles[value]}", exact: true }));`);
  s = s.replace(/screen\.getByLabelText\("(Builder|Personal) account"\)/g, (_, value) => `screen.getByRole("radio", { name: "${value} Account" })`);
  fs.writeFileSync(file, s);
}
