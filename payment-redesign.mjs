import fs from 'node:fs';
function edit(path, run) {
  let text = fs.readFileSync(path, 'utf8');
  const replace = (pattern, replacement) => {
    if (!text.match(pattern)) throw new Error(`Missing pattern in ${path}: ${pattern}`);
    text = text.replace(pattern, replacement);
  };
  run(replace);
  fs.writeFileSync(path, text);
}
edit('src/features/projects/components/ProjectPartnerDialog.tsx', (r) => {
  r(/        <DialogHeader>[\s\S]*?<\/DialogHeader>/, '        <PaymentModalHeader icon={HandCoins} eyebrow="PROJECT PARTNER" title={partner ? `Record payment · ${partner.name}` : editingPartner ? `Edit partner · ${editingPartner.name}` : "Add project partner"} description={partner ? "Record money received from this partner." : editingPartner ? "Update this partner’s profile and agreement." : "Add a partner in three short steps."} />');
  r(/<div className="space-y-1.5">\s*<Label htmlFor="partner-method">[\s\S]*?<\/select>\s*<\/div>/, '<div className="sm:col-span-2"><PaymentMethodSelect value={method} onChange={setMethod} /></div>');
});
edit('src/features/projects/components/ProjectPartnerManageDialog.tsx', (r) => {
  r(/^/, 'import { PaymentAccountSelect, PaymentMethodSelect, PaymentModalHeader } from "@/components/PaymentChoices";\n');
  r(/Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle/, 'Dialog, DialogContent, DialogFooter');
  r(/const methods:[\s\S]*?\];/, '');
  r(/className="partner-manage-dialog max-h-\[90vh\] overflow-y-auto sm:max-w-3xl"/, 'className="partner-manage-dialog payment-modal"');
  r(/<DialogHeader>[\s\S]*?<\/DialogHeader>/, '<PaymentModalHeader icon={HandCoins} eyebrow="PROJECT PARTNER" title={partner.name} description="Edit the agreement, record money received, or save profit paid out." />');
  r(/<fieldset className="partner-manage-choice"><legend>\{step === 1[\s\S]*?<\/fieldset>/, '<PaymentAccountSelect value={account} onChange={setAccount} direction={step === 1 ? "in" : "out"} disabled={pending} />');
  r(/<fieldset className="partner-manage-choice"><legend>How was it paid\?[\s\S]*?<\/fieldset>/, '<PaymentMethodSelect value={method} onChange={setMethod} disabled={pending} />');
});
edit('src/features/projects/pages/ProjectDetailPage.tsx', (r) => {
  r(/^/, 'import { PaymentMethodSelect, PaymentModalHeader } from "@/components/PaymentChoices";\n');
  r(/className="project-stage-dialog project-stage-redesign max-h-\[90vh\] overflow-y-auto sm:max-w-xl"/, 'className="project-stage-dialog project-stage-redesign payment-modal"');
  r(/<DialogHeader>\s*<span className="project-modal-icon">[\s\S]*?<\/DialogHeader>/, '<PaymentModalHeader icon={Building2} eyebrow="PROJECT JOURNEY" title="Change project status" description="Choose the project stage and save the land and payment details." />\n              <div className="payment-modal-scroll">');
  r(/(<DialogFooter>[\s\S]*?Save land and status)/, '$1');
  // Close the scrolling body before this dialog’s footer (the next footer after the header).
  r(/(<div className="payment-modal-scroll">[\s\S]*?)(\s*<DialogFooter>)/, '$1\n              </div>$2');
  r(/<div>\s*<Label htmlFor="stage-land-method">[\s\S]*?<\/select>\s*<\/div>/, '<div className="sm:col-span-2"><PaymentMethodSelect value={landPaymentDetails.method} onChange={(method) => { setLandPaymentDetails({ ...emptyLandPaymentDetails, paid_to: landPaymentDetails.paid_to || landSeller, method }); setLandPaymentImages([]); }} /></div>');
});
edit('src/features/personal-expense/pages/PersonalExpensePage.tsx', (r) => {
  r(/^/, 'import { PaymentModalHeader } from "@/components/PaymentChoices";\n');
  r(/className="expense-dialog expense-wizard expense-wizard-redesign max-h-\[92vh\] overflow-y-auto sm:max-w-xl"/, 'className="expense-dialog expense-wizard expense-wizard-redesign payment-modal"');
  r(/<DialogHeader>\s*<div className="expense-wizard-head">[\s\S]*?<\/DialogHeader>/, '<PaymentModalHeader icon={ShoppingBag} eyebrow="PERSONAL PURCHASE" title={record ? "Edit purchase" : "Add a personal purchase"} description="Complete one short step at a time, then review your purchase." />');
});
edit('src/features/udhaar/pages/CreditUdhaarPage.tsx', (r) => {
  r(/^/, 'import { PaymentModalHeader } from "@/components/PaymentChoices";\n');
  r(/className="udhaar-entry-dialog udhaar-colorful-entry"/, 'className="udhaar-entry-dialog udhaar-colorful-entry payment-modal"');
  r(/<DialogHeader className="udhaar-entry-header">[\s\S]*?<\/DialogHeader>/, '<PaymentModalHeader icon={HandCoins} eyebrow="NEW MONEY LENT" title="Give Udhaar" description="Record who you lent to, the amount, and how it was paid." />');
  r(/className="udhaar-repayment-dialog max-h-\[92vh\] overflow-y-auto sm:max-w-lg"/, 'className="udhaar-repayment-dialog payment-modal"');
  r(/<DialogHeader>\s*<span className="udhaar-dialog-icon">[\s\S]*?<\/DialogHeader>/, '<PaymentModalHeader icon={ArrowDownLeft} eyebrow="MONEY RECEIVED" title={`Record repayment from ${record.borrower_name}`} description="Choose the receiving account and record the payment details." />');
  r(/        <p className="udhaar-repayment-balance">([\s\S]*?)<form id="udhaar-payment-form" onSubmit=\{submit\} className="space-y-4">/, '        <form id="udhaar-payment-form" onSubmit={submit} className="space-y-4">\n        <p className="udhaar-repayment-balance">$1');
});
