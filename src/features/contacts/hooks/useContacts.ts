import { useState, useEffect, useCallback } from "react";
import type { Contact } from "@/domain/types";
import {
  listContacts,
  createContact,
  updateContact,
  archiveContact,
  type CreateContactInput,
  type UpdateContactInput,
} from "@/data/repositories/contactsRepository";
import { toast } from "sonner";

export function useContacts(search: string) {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await listContacts(search);
      setContacts(data);
    } catch (e) {
      setError(String(e));
    } finally {
      setIsLoading(false);
    }
  }, [search]);

  useEffect(() => {
    let active = true;
    const fetchContacts = async () => {
      try {
        const data = await listContacts(search);
        if (active) {
          setContacts(data);
          setError(null);
        }
      } catch (e) {
        if (active) {
          setError(String(e));
        }
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    };

    void fetchContacts();
    return () => {
      active = false;
    };
  }, [search]);

  async function addContact(input: CreateContactInput) {
    try {
      await createContact(input);
      toast.success("Contact added");
      await load();
    } catch (e) {
      toast.error(`Failed to add contact: ${String(e)}`);
      throw e;
    }
  }

  async function editContact(input: UpdateContactInput) {
    try {
      await updateContact(input);
      toast.success("Contact updated");
      await load();
    } catch (e) {
      toast.error(`Failed to update contact: ${String(e)}`);
      throw e;
    }
  }

  async function archive(id: string) {
    try {
      await archiveContact(id);
      toast.success("Contact archived");
      await load();
    } catch (e) {
      toast.error(`Failed to archive: ${String(e)}`);
      throw e;
    }
  }

  return { contacts, isLoading, error, addContact, editContact, archive, refresh: load };
}
