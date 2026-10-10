import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { AttachmentUpload } from "@/components/AttachmentUpload";
import { PartnerPaymentFields } from "@/components/PartnerPaymentFields";
import { emptyPaymentDetails } from "@/data/repositories/projectPartnersRepository";
function Upload({
  allowPdf = false,
  mode = "replace",
}: {
  allowPdf?: boolean;
  mode?: "append" | "replace";
}) {
  const [files, setFiles] = useState<File[]>([]);
  return <AttachmentUpload files={files} onChange={setFiles} allowPdf={allowPdf} mode={mode} />;
}
describe("shared attachments", () => {
  it("appends valid files, permits reselecting a file, and removes selected files", () => {
    render(<Upload mode="append" />);
    const input = screen.getByLabelText(/Add transaction receipt/);
    fireEvent.change(input, {
      target: { files: [new File(["one"], "one.png", { type: "image/png" })] },
    });
    fireEvent.change(input, {
      target: { files: [new File(["two"], "two.jpg", { type: "image/jpeg" })] },
    });
    expect(screen.getByRole("button", { name: "Remove one.png" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove two.jpg" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Remove one.png" }));
    expect(screen.queryByRole("button", { name: "Remove one.png" })).not.toBeInTheDocument();
    expect(input).toHaveValue("");
  });
  it("rejects an invalid batch without discarding previously selected images", () => {
    render(<Upload />);
    const input = screen.getByLabelText(/Add transaction receipt/);
    fireEvent.change(input, {
      target: { files: [new File(["one"], "one.png", { type: "image/png" })] },
    });
    fireEvent.change(input, {
      target: { files: [new File(["pdf"], "proof.pdf", { type: "application/pdf" })] },
    });
    expect(screen.getByRole("alert")).toHaveTextContent("JPEG");
    expect(screen.getByRole("button", { name: "Remove one.png" })).toBeInTheDocument();
  });
  it("allows PDFs only when requested", () => {
    render(<Upload allowPdf />);
    fireEvent.change(screen.getByLabelText(/Add transaction receipt/), {
      target: { files: [new File(["pdf"], "proof.pdf", { type: "application/pdf" })] },
    });
    expect(screen.getByRole("button", { name: "Remove proof.pdf" })).toBeInTheDocument();
  });
});
it("uses unique field IDs and matches the partner method's required fields", () => {
  const props = {
    value: emptyPaymentDetails,
    onChange: () => {},
    reference: "",
    onReferenceChange: () => {},
  };
  const { rerender } = render(<PartnerPaymentFields {...props} method="cash" />);
  expect(screen.getByLabelText("Receipt number (optional)")).toBeInTheDocument();
  expect(screen.queryByText("Received by")).not.toBeInTheDocument();
  rerender(
    <>
      <PartnerPaymentFields {...props} method="digital" />
      <PartnerPaymentFields {...props} method="digital" />
    </>,
  );
  const wallets = screen.getAllByLabelText("Wallet or service *");
  expect(wallets[0].id).not.toBe(wallets[1].id);
  expect(screen.getAllByLabelText("Transaction ID *")).toHaveLength(2);
});
