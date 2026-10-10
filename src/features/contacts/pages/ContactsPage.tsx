import { useState } from "react";
import {
  Archive,
  CalendarDays,
  ChevronDown,
  ClipboardList,
  LayoutGrid,
  List,
  MapPin,
  Pencil,
  Phone,
  Search,
  SlidersHorizontal,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import type { Contact } from "@/domain/types";
import { useContacts } from "@/features/contacts/hooks/useContacts";
import { ContactDialog } from "@/features/contacts/components/ContactDialog";
import { ContactsTable } from "@/features/contacts/components/ContactsTable";
import type { ContactFormValues } from "@/features/contacts/schemas";
import { EmptyState } from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { useRecordFilters } from "@/components/RecordFilters";
import { formatDate } from "@/lib/dates";
import "./contacts-page.css";

export function ContactsPage() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [view, setView] = useState<"cards" | "table">("cards");
  const [confirmArchiveId, setConfirmArchiveId] = useState<string | null>(null);

  const { contacts, isLoading, error, addContact, editContact, archive } = useContacts("");
  const { visible, pageItems, pagination, controls, search, setSearch, active, reset } = useRecordFilters(contacts, {
    label: "contacts",
    paginate: view !== "table",
    showSearch: false,
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

  const withPhone = contacts.filter((contact) => contact.phone || contact.phone2).length;
  const withAddress = contacts.filter((contact) => contact.address).length;

  return (
    <main className="contacts-page">
      <header className="contacts-heading">
        <div>
          <p className="contacts-eyebrow">
            <Users size={16} /> YOUR PEOPLE & CONNECTIONS
          </p>
          <h1>Contacts</h1>
          <p>Keep the people you work with close at hand.</p>
        </div>
        <Button id="contacts-add-btn" onClick={openAdd}>
          <UserPlus size={18} /> Add Contact
        </Button>
      </header>

      {/* States */}
      {isLoading && (
        <p className="text-sm text-muted-foreground py-8 text-center">Loading contacts…</p>
      )}

      {!isLoading && error && (
        <p className="text-sm text-destructive py-8 text-center">Error: {error}</p>
      )}

      {!isLoading && !error && (
        <div className="contacts-metrics">
          <div className="contacts-metric is-total">
            <span>
              <Users size={23} />
            </span>
            <small>Total contacts</small>
            <strong>{contacts.length}</strong>
            <p>People in your workspace</p>
          </div>
          <div className="contacts-metric is-phone">
            <span>
              <Phone size={23} />
            </span>
            <small>Phone available</small>
            <strong>{withPhone}</strong>
            <p>Ready to reach by phone</p>
          </div>
          <div className="contacts-metric is-address">
            <span>
              <MapPin size={23} />
            </span>
            <small>Address saved</small>
            <strong>{withAddress}</strong>
            <p>Contacts with a location</p>
          </div>
        </div>
      )}
      {!isLoading && !error && (
        <section className="contacts-directory">
          <div className="contacts-directory-top">
            <div>
              <h2>Contact directory</h2>
              <p>Find a person, review their details or update their profile.</p>
            </div>
            <span>
              {visible.length} of {contacts.length} shown
            </span>
          </div>
          <div className="contacts-search">
            <Search size={19} />
            <input
              aria-label="Search contacts"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search names, phone numbers, addresses or notes…"
            />
          </div>
          <details className="contacts-filter-drawer">
            <summary>
              <span>
                <SlidersHorizontal size={18} /> More filters
              </span>
              <span>
                {active ? "Filters applied" : "Phone, date & sort"}
                <ChevronDown size={16} />
              </span>
            </summary>
            {controls}
          </details>{pagination}
          {active && (
            <div className="contacts-active-filter">
              <span>{visible.length} contacts match your filters.</span>
              <Button variant="ghost" size="sm" onClick={reset}>
                Clear filters
              </Button>
            </div>
          )}
          <div className="contacts-view-bar">
            <span>View contacts</span>
            <div role="group" aria-label="Contact layout">
              <button
                type="button"
                aria-pressed={view === "cards"}
                onClick={() => setView("cards")}
              >
                <LayoutGrid size={17} /> Cards
              </button>
              <button
                type="button"
                aria-pressed={view === "table"}
                onClick={() => setView("table")}
              >
                <List size={17} /> Table
              </button>
            </div>
          </div>
          {contacts.length === 0 && !active && (
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

          {(contacts.length > 0 || active) &&
            (view === "table" ? (
              <ContactsTable contacts={visible} search="" onEdit={openEdit} onArchive={archive} />
            ) : (
              <>
                <div className="contacts-cards">
                  {pageItems.map((contact) => (
                    <article className="contacts-card" key={contact.id}>
                      <div className="contacts-card-top">
                        <span className="contacts-avatar">
                          <Users size={24} />
                        </span>
                        <div>
                          <h3>{contact.name}</h3>
                          <p>
                            <Phone size={14} />{" "}
                            {contact.phone || contact.phone2 || "No phone added"}
                          </p>
                        </div>
                        <div className="contacts-card-actions">
                          <button
                            type="button"
                            aria-label={`Edit ${contact.name}`}
                            onClick={() => openEdit(contact)}
                          >
                            <Pencil size={17} />
                          </button>
                          <button
                            type="button"
                            aria-label={`Archive ${contact.name}`}
                            onClick={() => setConfirmArchiveId(contact.id)}
                          >
                            <Archive size={17} />
                          </button>
                        </div>
                      </div>
                      <div className="contacts-card-detail">
                        <span>
                          <MapPin size={17} /> Address
                        </span>
                        <strong>{contact.address || "Not added"}</strong>
                      </div>
                      {contact.phone2 && contact.phone && (
                        <div className="contacts-card-detail">
                          <span>
                            <Phone size={17} /> Other phone
                          </span>
                          <strong>{contact.phone2}</strong>
                        </div>
                      )}
                      {contact.notes && (
                        <div className="contacts-card-detail">
                          <span>
                            <ClipboardList size={17} /> Notes
                          </span>
                          <strong>{contact.notes}</strong>
                        </div>
                      )}
                      <div className="contacts-card-footer">
                        <CalendarDays size={15} /> Added {formatDate(contact.created_at)}
                      </div>
                    </article>
                  ))}
                </div>
                {visible.length === 0 && (
                  <p className="contacts-no-results">
                    No contacts match these filters. Try changing or clearing them.
                  </p>
                )}
              </>
            ))}
        </section>
      )}
      {confirmArchiveId && (
        <div className="contacts-confirm-backdrop" role="presentation">
          <div
            className="contacts-confirm"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="contacts-confirm-title"
            aria-describedby="contacts-confirm-description"
          >
            <button
              type="button"
              className="contacts-confirm-close"
              aria-label="Cancel archive"
              onClick={() => setConfirmArchiveId(null)}
            >
              <X size={18} />
            </button>
            <span>
              <Archive size={23} />
            </span>
            <h2 id="contacts-confirm-title">Archive contact?</h2>
            <p id="contacts-confirm-description">
              This removes the contact from this directory. The saved record can still be recovered
              from the database.
            </p>
            <div>
              <Button variant="outline" onClick={() => setConfirmArchiveId(null)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={() => {
                  archive(confirmArchiveId);
                  setConfirmArchiveId(null);
                }}
              >
                Archive contact
              </Button>
            </div>
          </div>
        </div>
      )}

      <ContactDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        contact={editingContact}
        onSubmit={handleSubmit}
      />
    </main>
  );
}
