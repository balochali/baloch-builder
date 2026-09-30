import { useState } from "react";
import { UserPlus } from "lucide-react";
import type { Contact } from "@/domain/types";
import { useContacts } from "@/features/contacts/hooks/useContacts";
import { ContactDialog } from "@/features/contacts/components/ContactDialog";
import { ContactsTable } from "@/features/contacts/components/ContactsTable";
import type { ContactFormValues } from "@/features/contacts/schemas";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { useRecordFilters } from "@/components/RecordFilters";

export function ContactsPage() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);

  const { contacts, isLoading, error, addContact, editContact, archive } = useContacts("");
  const { visible, controls, active } = useRecordFilters(contacts, {
    label: "contacts",
    searchText: (contact) =>
      [contact.name, contact.phone, contact.phone2, contact.address, contact.notes]
        .filter(Boolean)
        .join(" "),
    date: (contact) => contact.created_at,
    dateLabel: "Added",
    facets: [
      {
        label: "Phone details",
        value: (contact) => (contact.phone || contact.phone2 ? "Phone recorded" : "Missing phone"),
      },
    ],
  });

  function openAdd() {
    setEditingContact(null);
    setDialogOpen(true);
  }

  function openEdit(contact: Contact) {
    setEditingContact(contact);
    setDialogOpen(true);
  }

  async function handleSubmit(values: ContactFormValues) {
    if (editingContact) {
      await editContact({ id: editingContact.id, ...values });
    } else {
      await addContact(values);
    }
  }

  return (
    <div>
      <PageHeader
        title="Contacts"
        description="People you work with: sellers, buyers, partners, contractors."
        action={
          <Button id="contacts-add-btn" onClick={openAdd}>
            <UserPlus className="size-4" />
            Add Contact
          </Button>
        }
      />

      {controls}

      {/* States */}
      {isLoading && (
        <p className="text-sm text-muted-foreground py-8 text-center">Loading contacts…</p>
      )}

      {!isLoading && error && (
        <p className="text-sm text-destructive py-8 text-center">Error: {error}</p>
      )}

      {!isLoading && !error && contacts.length === 0 && !active && (
        <EmptyState
          icon={<UserPlus className="size-12" />}
          title="No contacts yet"
          description="Add your first contact to get started."
          action={
            <Button onClick={openAdd}>
              <UserPlus className="size-4 mr-1" />
              Add Contact
            </Button>
          }
        />
      )}

      {!isLoading && !error && (contacts.length > 0 || active) && (
        <ContactsTable contacts={visible} search="" onEdit={openEdit} onArchive={archive} />
      )}

      <ContactDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        contact={editingContact}
        onSubmit={handleSubmit}
      />
    </div>
  );
}
