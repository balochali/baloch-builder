import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ContactFormSchema, type ContactFormValues } from "@/features/contacts/schemas";
import type { Contact } from "@/domain/types";

interface ContactDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** If provided, the dialog is in edit mode */
  contact?: Contact | null;
  onSubmit: (values: ContactFormValues) => Promise<void>;
}

export function ContactDialog({ open, onOpenChange, contact, onSubmit }: ContactDialogProps) {
  const isEdit = !!contact;

  const form = useForm<ContactFormValues>({
    resolver: zodResolver(ContactFormSchema),
    defaultValues: {
      name: "",
      phone: "",
      phone2: "",
      address: "",
      notes: "",
    },
  });

  // Populate form when editing
  useEffect(() => {
    if (open && contact) {
      form.reset({
        name: contact.name,
        phone: contact.phone ?? "",
        phone2: contact.phone2 ?? "",
        address: contact.address ?? "",
        notes: contact.notes ?? "",
      });
    } else if (open && !contact) {
      form.reset({ name: "", phone: "", phone2: "", address: "", notes: "" });
    }
  }, [open, contact, form]);

  async function handleFormSubmit(values: ContactFormValues) {
    await onSubmit(values);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Contact" : "Add Contact"}</DialogTitle>
        </DialogHeader>

        <form
          id="contact-form"
          onSubmit={form.handleSubmit(handleFormSubmit)}
          className="space-y-4"
        >
          {/* Name */}
          <div className="space-y-1.5">
            <Label htmlFor="contact-name">
              Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="contact-name"
              placeholder="Full name"
              aria-invalid={!!form.formState.errors.name}
              {...form.register("name")}
            />
            {form.formState.errors.name && (
              <p className="text-xs text-destructive" role="alert">
                {form.formState.errors.name.message}
              </p>
            )}
          </div>

          {/* Phone */}
          <div className="space-y-1.5">
            <Label htmlFor="contact-phone">Phone</Label>
            <Input
              id="contact-phone"
              placeholder="e.g. 0300-1234567"
              {...form.register("phone")}
            />
          </div>

          {/* Phone 2 */}
          <div className="space-y-1.5">
            <Label htmlFor="contact-phone2">Phone 2</Label>
            <Input
              id="contact-phone2"
              placeholder="Alternate phone"
              {...form.register("phone2")}
            />
          </div>

          {/* Address */}
          <div className="space-y-1.5">
            <Label htmlFor="contact-address">Address</Label>
            <Input
              id="contact-address"
              placeholder="Address"
              {...form.register("address")}
            />
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <Label htmlFor="contact-notes">Notes</Label>
            <textarea
              id="contact-notes"
              rows={3}
              className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:border-ring"
              placeholder="Optional notes"
              {...form.register("notes")}
            />
          </div>
        </form>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            type="button"
          >
            Cancel
          </Button>
          <Button
            id="contact-form-submit"
            form="contact-form"
            type="submit"
            disabled={form.formState.isSubmitting}
          >
            {form.formState.isSubmitting ? "Saving…" : isEdit ? "Save Changes" : "Add Contact"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
