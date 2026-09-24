import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { CreateProjectSchema, ProjectStatuses, type CreateProjectInput } from "@/data/repositories/projectsRepository";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface ProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: CreateProjectInput) => Promise<void>;
}

const defaults: CreateProjectInput = {
  name: "", location: "", code: "", description: "", status: "planning", start_date: "",
};

export function ProjectDialog({ open, onOpenChange, onSubmit }: ProjectDialogProps) {
  const [saveError, setSaveError] = useState("");
  const form = useForm<CreateProjectInput>({
    resolver: zodResolver(CreateProjectSchema),
    defaultValues: defaults,
  });

  async function save(values: CreateProjectInput) {
    setSaveError("");
    try {
      await onSubmit(values);
      onOpenChange(false);
    } catch (error) {
      setSaveError(`Could not create project: ${String(error)}`);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Add Project</DialogTitle></DialogHeader>
        <form id="project-form" onSubmit={form.handleSubmit(save)} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="project-name">Project name <span className="text-destructive">*</span></Label>
            <Input id="project-name" placeholder="e.g. Baloch Residency" aria-invalid={!!form.formState.errors.name} {...form.register("name")} />
            {form.formState.errors.name && <p role="alert" className="text-xs text-destructive">{form.formState.errors.name.message}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="project-location">Project address <span className="text-destructive">*</span></Label>
            <Input id="project-location" placeholder="Street, area and city" aria-invalid={!!form.formState.errors.location} {...form.register("location")} />
            {form.formState.errors.location && <p role="alert" className="text-xs text-destructive">{form.formState.errors.location.message}</p>}
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="project-code">Project code</Label>
              <Input id="project-code" placeholder="Optional reference" {...form.register("code")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="project-status">Status</Label>
              <select id="project-status" className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm" {...form.register("status")}>
                {ProjectStatuses.map((status) => <option key={status} value={status}>{status.charAt(0).toUpperCase() + status.slice(1)}</option>)}
              </select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="project-start-date">Start date</Label>
            <Input id="project-start-date" type="date" {...form.register("start_date")} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="project-description">Description</Label>
            <textarea id="project-description" rows={3} placeholder="Optional notes about the project"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              {...form.register("description")} />
          </div>
          {saveError && <p role="alert" className="text-sm text-destructive">{saveError}</p>}
        </form>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="submit" form="project-form" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting ? "Creating…" : "Create Project"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
