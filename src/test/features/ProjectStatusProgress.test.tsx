import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ProjectStatusProgress } from "@/features/projects/components/ProjectStatusProgress";

describe("ProjectStatusProgress", () => {
  it("shows the current step and all project stages", () => {
    render(<ProjectStatusProgress status="land acquired" />);
    expect(screen.getByRole("img", { name: "Project at Land acquired, stage 2 of 4" })).toBeInTheDocument();
    expect(screen.getByText("Current stage: Land acquired · Step 2 of 4")).toBeInTheDocument();
    expect(screen.getByText("Planning")).toBeInTheDocument();
    expect(screen.getByText("Construction")).toBeInTheDocument();
    expect(screen.getByText("Completed")).toBeInTheDocument();
  });

  it("does not invent a previous stage when the project is on hold", () => {
    render(<ProjectStatusProgress status="on hold" />);
    expect(screen.getByRole("img", { name: "Project on hold; prior stage is unknown" })).toBeInTheDocument();
    expect(screen.getByText("Work is paused. The stage before the pause was not recorded.")).toBeInTheDocument();
  });
});
