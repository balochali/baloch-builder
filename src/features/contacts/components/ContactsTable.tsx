import { useState } from "react";
import { type ColumnDef } from "@tanstack/react-table";
import { MoreHorizontal, Edit, Archive } from "lucide-react";
import type { Contact } from "@/domain/types";
import { DataTable } from "@/components/DataTable";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatDate } from "@/lib/dates";

interface ContactsTableProps {
  contacts: Contact[];
  search: string;
  onEdit: (contact: Contact) => void;
  onArchive: (id: string) => void;
}

export function ContactsTable({ contacts, search, onEdit, onArchive }: ContactsTableProps) {
  const [confirmArchiveId, setConfirmArchiveId] = useState<string | null>(null);

  const columns: ColumnDef<Contact>[] = [
    {
      accessorKey: "name",
      header: "Name",
      cell: ({ row }) => (
        <span className="font-medium">{row.original.name}</span>
      ),
    },
    {
      accessorKey: "phone",
      header: "Phone",
      cell: ({ row }) => row.original.phone ?? <span className="text-muted-foreground">—</span>,
    },
    {
      accessorKey: "address",
      header: "Address",
      cell: ({ row }) =>
        row.original.address ?? <span className="text-muted-foreground">—</span>,
    },
    {
      accessorKey: "created_at",
      header: "Added",
      cell: ({ row }) => (
        <span className="text-muted-foreground text-sm">
          {formatDate(row.original.created_at)}
        </span>
      ),
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => {
        const c = row.original;
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                id={`contact-actions-${c.id}`}
                variant="ghost"
                size="icon"
                aria-label={`Actions for ${c.name}`}
              >
                <MoreHorizontal className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                id={`contact-edit-${c.id}`}
                onClick={() => onEdit(c)}
              >
                <Edit className="mr-2 size-4" />
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem
                id={`contact-archive-${c.id}`}
                variant="destructive"
                onClick={() => setConfirmArchiveId(c.id)}
              >
                <Archive className="mr-2 size-4" />
                Archive
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    },
  ];

  // Inline confirm banner
  function handleConfirmArchive() {
    if (confirmArchiveId) {
      onArchive(confirmArchiveId);
      setConfirmArchiveId(null);
    }
  }

  return (
    <div className="space-y-3">
      {confirmArchiveId && (
        <div className="flex items-center justify-between rounded-md border border-destructive/30 bg-destructive/10 px-4 py-2 text-sm">
          <span>Archive this contact? This is reversible from the database, but not from the UI yet.</span>
          <div className="flex gap-2 ml-4">
            <Button size="sm" variant="destructive" onClick={handleConfirmArchive}>
              Confirm
            </Button>
            <Button size="sm" variant="outline" onClick={() => setConfirmArchiveId(null)}>
              Cancel
            </Button>
          </div>
        </div>
      )}
      <DataTable
        columns={columns}
        data={contacts}
        globalFilter={search}
        emptyMessage="No contacts found. Add one above."
      />
    </div>
  );
}
