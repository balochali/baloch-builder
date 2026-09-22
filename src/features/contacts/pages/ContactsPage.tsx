import { useState } from "react";
import { UserPlus, Search } from "lucide-react";
import type { Contact } from "@/domain/types";
import { useContacts } from "@/features/contacts/hooks/useContacts";
import { ContactDialog } from "@/features/contacts/components/ContactDialog";
import { ContactsTable } from "@/features/contacts/components/ContactsTable";
import type { ContactFormValues } from "@/features/contacts/schemas";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function ContactsPage() {
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);

  const { contacts, isLoading, error, addContact, editContact, archive } = useContacts(search);

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

      {/* Search bar */}
      <div className="relative mb-4 max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
        <Input
          id="contacts-search"
          className="pl-9"
          placeholder="Search by name, phone or address…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* States */}
      {isLoading && (
        <p className="text-sm text-muted-foreground py-8 text-center">Loading contacts…</p>
      )}

      {!isLoading && error && (
        <p className="text-sm text-destructive py-8 text-center">Error: {error}</p>
      )}

      {!isLoading && !error && contacts.length === 0 && !search && (
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

      {!isLoading && !error && (contacts.length > 0 || search) && (
        <ContactsTable
          contacts={contacts}
          search={search}
          onEdit={openEdit}
          onArchive={archive}
        />
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
